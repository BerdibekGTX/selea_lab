import hashlib
import json
import io
import subprocess
import imageio_ffmpeg
from PIL import Image
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from app import main, video

buf=io.BytesIO()
Image.new("RGB",(2,2),(255,0,0)).save(buf,format="PNG")
PNG=buf.getvalue()
def make_mp4():
    import tempfile
    with tempfile.TemporaryDirectory() as directory:
        path=Path(directory)/"sample.mp4"
        subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),"-v","error","-f","lavfi","-i","color=c=red:s=16x16:d=0.2","-c:v","mpeg4","-t","0.2","-y",str(path)],check=True)
        return path.read_bytes()
MP4=make_mp4()

@pytest.fixture
def env(tmp_path,monkeypatch):
    monkeypatch.setattr(main,"DB",tmp_path/"arena.db")
    monkeypatch.setattr(video,"MEDIA",tmp_path/"media")
    video.MEDIA.mkdir()
    main.init_db()
    with main.db() as con:con.executescript(video.MIGRATION.read_text())
    admin=TestClient(main.app)
    visitor=TestClient(main.app)
    other=TestClient(main.app)
    for client in (admin,visitor,other):
        assert client.get("/api/video/session").status_code==200
    admin.get("/api/session")
    credentials={"email":"admin@example.test","password":"very-long-test-password","name":"Administrator"}
    assert admin.post("/api/auth/register",json=credentials).status_code==200
    uid=admin.get("/api/session").json()["user"]["id"]
    with main.db() as con:con.execute("INSERT INTO video_admins VALUES(?)",(uid,))
    return admin,visitor,other,tmp_path

def create_pair(admin):
    ids=[]
    for name in ("Model One","Model Two"):
        r=admin.post("/api/video/admin/models",json={"name":name,"provider":"Test","version":"1"})
        assert r.status_code==200,r.text
        ids.append(r.json()["id"])
    c=admin.post("/api/video/admin/challenges",json={"title":"Rain","category":"text-to-video","prompt":"A rainy street","criterion":"Motion quality","selection_policy":"first-successful"})
    assert c.status_code==200,c.text
    cid=c.json()["id"]
    outputs=[]
    for i,mid in enumerate(ids):
        r=admin.post("/api/video/admin/runs",json={"challenge_id":cid,"model_id":mid,"platform":"Manual Platform","generated_at":"2026-11-08","settings":{"seed":i},"attempt":1,"status":"success"})
        assert r.status_code==200,r.text
        rid=r.json()["id"]
        out=admin.post("/api/video/admin/outputs",data={"run_id":rid,"duration":"5","resolution":"1280x720","audio":"false"},files={"video":("source.mp4",MP4,"video/mp4")})
        assert out.status_code==200,out.text
        oid=out.json()["id"]
        assert admin.post(f"/api/video/admin/outputs/{oid}/status",json={"status":"published"}).status_code==200
        outputs.append(oid)
    pairs=admin.post("/api/video/admin/pairs/generate",json={"challenge_id":cid})
    assert pairs.status_code==200,pairs.text
    pid=pairs.json()["created"][0]
    assert admin.get(f"/api/video/admin/pairs/{pid}/preview").status_code==200
    assert admin.post(f"/api/video/admin/challenges/{cid}/status",json={"status":"published"}).status_code==200
    assert admin.post(f"/api/video/admin/pairs/{pid}/status",json={"status":"published"}).status_code==200
    return cid,pid,ids,outputs

def test_admin_to_vote_reveal_rank_withdraw_and_restart(env):
    admin,visitor,other,tmp=env
    cid,pid,models,outputs=create_pair(admin)
    assert other.get("/api/video/admin/overview").status_code in (401,403)
    assert other.get(f"/api/video/admin/pairs/{pid}/preview").status_code in (401,403)
    pair=visitor.get("/api/video/arena/next?category=text-to-video").json()
    assert not pair["empty"]
    assert "model" not in pair["a"] and "provider" not in pair["a"]
    assert "model" not in pair["b"]
    assert pair["a"]["id"]!=pair["b"]["id"]
    assert visitor.get(pair["a"]["video"]).status_code==200
    assert visitor.get(pair["b"]["video"]).status_code==200
    vote=visitor.post("/api/video/votes",json={"session_id":pair["session_id"],"choice":"a"})
    assert vote.status_code==200,vote.text
    assert vote.json()["a"]["model"]
    assert visitor.post("/api/video/votes",json={"session_id":pair["session_id"],"choice":"a"}).json()["vote_id"]==vote.json()["vote_id"]
    assert visitor.post("/api/video/votes",json={"session_id":pair["session_id"],"choice":"b"}).status_code==409
    assert visitor.get("/api/video/arena/next?category=text-to-video").json()["empty"]
    public=visitor.get("/api/video/leaderboard?category=text-to-video&source=public").json()["rankings"]
    winner=next(x for x in public if x["name"]==vote.json()["a"]["model"])
    assert winner["wins"]==1 and winner["score"]==1
    preview=admin.get(f"/api/video/admin/pairs/{pid}/preview").json()
    team=admin.post("/api/video/admin/team-votes",json={"pair_id":pid,"choice":"b","a_output":preview["a"]["id"],"b_output":preview["b"]["id"]})
    assert team.status_code==200,team.text
    team_rows=admin.get("/api/video/leaderboard?category=text-to-video&source=team").json()["rankings"]
    assert sum(x["wins"] for x in team_rows)==1
    assert admin.post(f"/api/video/admin/pairs/{pid}/status",json={"status":"withdrawn"}).status_code==200
    assert other.get("/api/video/arena/next?category=text-to-video").json()["empty"]
    assert visitor.get(pair["a"]["video"]).status_code in (401,403)
    withdrawn=visitor.get("/api/video/leaderboard?category=text-to-video&source=public").json()["rankings"]
    assert sum(x["wins"] for x in withdrawn)==0
    assert len(admin.get("/api/video/admin/overview").json()["votes"])==2
    assert (tmp/"arena.db").exists()
    assert list((tmp/"media").glob("*.mp4"))
    # New client against the same on-disk database still sees the records.
    assert len(TestClient(main.app).get("/api/video/challenges").json())==1

def test_draft_media_and_admin_actions_are_private(env):
    admin,visitor,_,_=env
    model=admin.post("/api/video/admin/models",json={"name":"X","provider":"Y","version":"1"}).json()["id"]
    cid=admin.post("/api/video/admin/challenges",json={"title":"Image test","category":"image-to-video","prompt":"Move this","criterion":"Consistency","selection_policy":"first-successful"}).json()["id"]
    upload=admin.post(f"/api/video/admin/challenges/{cid}/source",files={"file":("image.png",PNG,"image/png")})
    assert upload.status_code==200,upload.text
    path=upload.json()["source_image"]
    assert visitor.get(path).status_code in (401,403)
    assert admin.get(path).status_code==200
    assert visitor.get(f"/api/video/challenges/{cid}").status_code==404
    assert visitor.post(f"/api/video/admin/challenges/{cid}/status",json={"status":"published"}).status_code in (401,403)
    bad=admin.post("/api/video/admin/runs",json={"challenge_id":cid,"model_id":model,"platform":"Test","generated_at":"2026-11-08","attempt":2,"status":"failed","settings":{}})
    assert bad.status_code==400

def test_invalidated_vote_excluded(env):
    admin,visitor,_,_=env
    cid,pid,_,_=create_pair(admin)
    pair=visitor.get("/api/video/arena/next?category=text-to-video").json()
    vid=visitor.post("/api/video/votes",json={"session_id":pair["session_id"],"choice":"tie"}).json()["vote_id"]
    assert admin.post(f"/api/video/admin/votes/{vid}/invalidate",json={"reason":"test invalidation"}).status_code==200
    rows=visitor.get("/api/video/leaderboard?category=text-to-video&source=public").json()["rankings"]
    assert sum(x["ties"] for x in rows)==0
    audit=admin.get("/api/video/admin/overview").json()["votes"]
    assert audit[0]["invalid_reason"]=="test invalidation"
    assert admin.post(f"/api/video/admin/votes/{vid}/flag",json={"reason":"Suspicious timing"}).status_code==200
    assert admin.get("/api/video/admin/overview").json()["vote_flags"][0]["reason"]=="Suspicious timing"


def test_image_challenge_upload_proposal_and_export(env):
    admin,visitor,_,tmp=env
    proposal=visitor.post("/api/video/proposals/with-image",data={"category":"image-to-video","prompt":"DEMO: animate this image"},files={"file":("source.png",PNG,"image/png")})
    assert proposal.status_code==200
    saved=admin.get("/api/video/admin/overview").json()["proposals"][0]
    assert saved["id"]==proposal.json()["id"]
    assert visitor.get("/api/video/media/"+saved["source_image"]).status_code in (401,403)
    assert admin.post(f"/api/video/admin/proposals/{saved['id']}/status",json={"status":"reviewed"}).status_code==200
    challenge=admin.post("/api/video/admin/challenges",json={"title":"Image test","category":"image-to-video","prompt":"Move camera","criterion":"Consistency","selection_policy":"first-successful"}).json()["id"]
    assert admin.post(f"/api/video/admin/challenges/{challenge}/status",json={"status":"published"}).status_code==400
    assert admin.post(f"/api/video/admin/challenges/{challenge}/source",files={"file":("source.png",PNG,"image/png")}).status_code==200
    assert admin.post(f"/api/video/admin/challenges/{challenge}/status",json={"status":"published"}).status_code==200
    detail=visitor.get(f"/api/video/challenges/{challenge}").json()
    assert detail["category"]=="image-to-video" and visitor.get(detail["source_image"]).status_code==200
    for table in ("challenges","runs","outputs","votes"):
        assert admin.get(f"/api/video/admin/export/{table}").status_code==200
        assert visitor.get(f"/api/video/admin/export/{table}").status_code in (401,403)


def test_failed_upload_leaves_no_file_or_output(env):
    admin,_,_,tmp=env
    _,_,_,_=create_pair(admin)
    run=admin.get("/api/video/admin/overview").json()["runs"][0]["id"]
    before={p.name for p in video.MEDIA.iterdir()}
    count=len(admin.get("/api/video/admin/overview").json()["outputs"])
    result=admin.post("/api/video/admin/outputs",data={"run_id":run,"duration":"1","resolution":"320x180"},files={"video":("test.mp4",MP4,"video/mp4"),"thumbnail":("broken.png",b"not an image","image/png")})
    assert result.status_code==415
    assert {p.name for p in video.MEDIA.iterdir()}==before
    assert len(admin.get("/api/video/admin/overview").json()["outputs"])==count


def test_team_vote_retry_catalog_and_category_isolation(env):
    admin,visitor,_,_=env
    _,pid,_,_=create_pair(admin)
    preview=admin.get(f"/api/video/admin/pairs/{pid}/preview").json()
    vote={"pair_id":pid,"choice":"a","a_output":preview["a"]["id"],"b_output":preview["b"]["id"]}
    first=admin.post("/api/video/admin/team-votes",json=vote)
    assert first.status_code==200
    assert admin.post("/api/video/admin/team-votes",json=vote).json()["id"]==first.json()["id"]
    assert admin.post("/api/video/admin/team-votes",json={**vote,"choice":"b"}).status_code==409
    assert len(visitor.get("/api/video/models").json())==2
    public=visitor.get("/api/video/leaderboard?category=text-to-video&source=public").json()["rankings"]
    assert all(m["score"] is None for m in public)
    image=visitor.get("/api/video/leaderboard?category=image-to-video&source=team").json()["rankings"]
    assert all(m["score"] is None and m["eligible_comparisons"]==0 for m in image)
    team=visitor.get("/api/video/leaderboard?category=text-to-video&source=team").json()["rankings"]
    assert sum(m["wins"] for m in team)==1 and all(m["preliminary"] for m in team)


def test_selection_policy_and_history_cannot_be_silently_changed(env):
    admin,_,_,_=env
    cid,_,_,_=create_pair(admin)
    detail=admin.get("/api/video/admin/overview").json()["challenges"][0]
    body={k:detail[k] for k in ("title","category","prompt","criterion","selection_policy","policy_deviation")}
    assert admin.put(f"/api/video/admin/challenges/{cid}",json={**body,"selection_policy":"best","policy_deviation":""}).status_code==400
    assert admin.put(f"/api/video/admin/challenges/{cid}",json={**body,"category":"image-to-video"}).status_code==409
    assert admin.put(f"/api/video/admin/challenges/{cid}",json={**body,"title":"Corrected title"}).status_code==200


def test_skip_and_both_bad_are_excluded_and_write_origin_is_checked(env):
    admin,visitor,other,_=env
    _,pid,_,_=create_pair(admin)
    for client,choice in ((visitor,"both-bad"),(other,"skip")):
        pair=client.get("/api/video/arena/next?category=text-to-video").json()
        assert client.post("/api/video/votes",json={"session_id":pair["session_id"],"choice":choice},headers={"Origin":"https://untrusted.example"}).status_code==403
        assert client.post("/api/video/votes",json={"session_id":pair["session_id"],"choice":choice}).status_code==200
    rows=visitor.get("/api/video/leaderboard?category=text-to-video&source=public").json()["rankings"]
    assert all(r["score"] is None and r["both_bad"]==1 for r in rows)
    assert admin.post(f"/api/video/admin/pairs/{pid}/status",json={"status":"withdrawn"}).status_code==200
    assert visitor.get("/api/video/models").json()==[]


def test_published_data_and_media_survive_fresh_process(env):
    import os,sys
    admin,visitor,_,tmp=env
    _,pid,_,_=create_pair(admin)
    pair=visitor.get("/api/video/arena/next?category=text-to-video").json()
    assert visitor.post("/api/video/votes",json={"session_id":pair["session_id"],"choice":"a"}).status_code==200
    child_env={**os.environ,"ARENA_DATABASE":str(tmp/"arena.db"),"SELEA_MEDIA_DIR":str(video.MEDIA)}
    script="from app import main,video; import json; from pathlib import Path; result=video.video_leaderboard('text-to-video','public'); assert sum(m['wins'] for m in result['rankings'])==1; assert len(list(video.MEDIA.glob('*.mp4')))==2; print('persisted')"
    result=subprocess.run([sys.executable,"-c",script],env=child_env,capture_output=True,text=True,timeout=30)
    assert result.returncode==0,result.stderr
    assert "persisted" in result.stdout


def test_archived_model_withdraws_pairs_but_keeps_audit_history(env):
    admin,visitor,_,_=env
    _,pid,models,_=create_pair(admin)
    body={"name":"Archived Model","provider":"Test","version":"1","active":False}
    assert admin.put(f"/api/video/admin/models/{models[0]}",json=body).status_code==200
    assert visitor.get("/api/video/arena/next?category=text-to-video").json()["empty"]
    assert admin.post(f"/api/video/admin/pairs/{pid}/status",json={"status":"published"}).status_code==400
    assert len(admin.get("/api/video/admin/overview").json()["pairs"])==1
