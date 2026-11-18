"""Manually-produced video comparison arena. No provider credentials are used here."""
import asyncio
import hashlib
import json
import os
import random
import re
import secrets
import sqlite3
import subprocess
import time
import uuid
from datetime import date
from pathlib import Path
from PIL import Image, ImageOps
import imageio_ffmpeg

from fastapi import APIRouter, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from . import main as core
db = core.db
owner = core.owner
DB = core.DB

router = APIRouter(prefix="/api/video", tags=["Video Arena"])
MEDIA = Path(os.environ.get("SELEA_MEDIA_DIR", str(DB.parent / "media")))
MEDIA.mkdir(parents=True, exist_ok=True)
MIGRATION = Path(__file__).resolve().parents[1] / "migrations" / "001_video_arena.sql"
with db() as con:
    con.executescript(MIGRATION.read_text())
    if "status" not in {r["name"] for r in con.execute("PRAGMA table_info(video_outputs)")}:
        con.execute("ALTER TABLE video_outputs ADD COLUMN status TEXT NOT NULL DEFAULT 'draft'")

CATEGORIES = ("text-to-video", "image-to-video")
CHOICES = ("a", "b", "tie", "both-bad", "skip")

def ident(): return uuid.uuid4().hex

def row(con, sql, values=(), status=404):
    found = con.execute(sql, values).fetchone()
    if not found: raise HTTPException(status, "Record not found.")
    return dict(found)

def admin(request):
    uid = owner(request)
    with db() as con:
        if not con.execute("SELECT 1 FROM video_admins WHERE user_id=?", (uid,)).fetchone():
            raise HTTPException(403, "Administrator access required.")
    return uid

def writable(request):
    # SameSite cookies plus an origin check for browser-initiated writes.
    origin = request.headers.get("origin")
    allowed = {part.strip() for part in os.environ.get("SELEA_ORIGIN", "http://localhost:3000,http://127.0.0.1:3000").split(",")}
    if origin and origin not in allowed:
        raise HTTPException(403, "Origin not allowed.")

def participant(request):
    token = request.cookies.get("selea_participant", "")
    if not token: raise HTTPException(401, "Open the Arena to start a participant session.")
    with db() as con:
        found = con.execute("SELECT id FROM video_participants WHERE token_hash=?", (hashlib.sha256(token.encode()).hexdigest(),)).fetchone()
    if not found: raise HTTPException(401, "Participant session expired. Reload the Arena.")
    return found["id"]

@router.get("/session")
def participant_session(request: Request, response: Response):
    try:
        pid = participant(request)
    except HTTPException:
        token = secrets.token_urlsafe(32)
        pid = ident()
        with db() as con:
            con.execute("INSERT INTO video_participants VALUES(?,?,?)", (pid, hashlib.sha256(token.encode()).hexdigest(), time.time()))
        response.set_cookie("selea_participant", token, httponly=True, samesite="strict", secure=os.getenv("COOKIE_SECURE") == "true", max_age=31536000, path="/")
    try: is_admin = bool(admin(request))
    except HTTPException: is_admin = False
    return {"participant": pid, "admin": is_admin}

class ModelIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    provider: str = Field(min_length=1, max_length=120)
    version: str = Field(min_length=1, max_length=120)
    active: bool = True

class ChallengeIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    category: str
    prompt: str = Field(min_length=1, max_length=10000)
    criterion: str = Field(min_length=1, max_length=3000)
    selection_policy: str = Field(min_length=1, max_length=2000)
    policy_deviation: str | None = None

class RunIn(BaseModel):
    challenge_id: str
    model_id: str
    platform: str = Field(min_length=1, max_length=150)
    generated_at: str
    settings: dict = Field(default_factory=dict)
    attempt: int = Field(ge=1)
    status: str
    retry_reason: str | None = None

class PairIn(BaseModel):
    output_1: str
    output_2: str

class StatusIn(BaseModel):
    status: str

class VoteIn(BaseModel):
    session_id: str
    choice: str

class TeamVoteIn(BaseModel):
    pair_id: str
    choice: str
    a_output: str
    b_output: str

class FlagIn(BaseModel):
    reason: str = Field(min_length=3, max_length=2000)

class ProposalIn(BaseModel):
    category: str
    prompt: str = Field(min_length=1, max_length=10000)
    source_image: str | None = None

def validate_category(value):
    if value not in CATEGORIES: raise HTTPException(400, "Unknown category.")

def public_challenge(c):
    return {k:c[k] for k in ("id","title","category","prompt","criterion","status") if k in c} | {"source_image": "/api/video/media/"+c["source_image"] if c.get("source_image") else None}

def output_public(out, reveal=False):
    result = {"id": out["id"], "video": "/api/video/media/"+out["video_path"], "thumbnail": "/api/video/media/"+out["thumbnail_path"] if out["thumbnail_path"] else None, "duration": out["duration"], "resolution": out["resolution"], "audio": bool(out["audio"])}
    if reveal: result.update({"model":out["model_name"], "provider":out["provider"], "version":out["version"], "platform":out["platform"], "settings":json.loads(out["settings"])})
    return result

def pair_outputs(con, pair_id):
    return [row(con,"SELECT o.*,m.name model_name,m.provider,m.version,r.platform,r.settings FROM video_outputs o JOIN video_runs r ON r.id=o.run_id JOIN video_models m ON m.id=r.model_id WHERE o.id=?",(oid,)) for oid in (row(con,"SELECT * FROM video_pairs WHERE id=?",(pair_id,))["output_1"],row(con,"SELECT * FROM video_pairs WHERE id=?",(pair_id,))["output_2"]) ]

def pair_valid(con, pair_id):
    p = row(con,"SELECT p.*,c.category,c.status challenge_status,c.prompt,c.criterion,c.title,c.source_image FROM video_pairs p JOIN video_challenges c ON c.id=p.challenge_id WHERE p.id=?",(pair_id,))
    if p["status"] != "published" or p["challenge_status"] != "published": raise HTTPException(410,"Comparison withdrawn.")
    return p

@router.get("/challenges")
def challenges(category: str | None = None):
    if category: validate_category(category)
    with db() as con:
        rows=con.execute("SELECT * FROM video_challenges WHERE status='published'"+(" AND category=?" if category else "")+" ORDER BY created_at DESC",(category,) if category else ()).fetchall()
        return [{**public_challenge(dict(c)),"rounds":con.execute("SELECT COUNT(*) FROM video_pairs WHERE challenge_id=? AND status='published'",(c["id"],)).fetchone()[0]} for c in rows]

@router.get("/challenges/{challenge_id}")
def challenge_detail(challenge_id: str):
    with db() as con:
        c=row(con,"SELECT * FROM video_challenges WHERE id=? AND status='published'",(challenge_id,))
        pairs=con.execute("SELECT id FROM video_pairs WHERE challenge_id=? AND status='published' ORDER BY created_at",(challenge_id,)).fetchall()
    return {**public_challenge(c),"rounds":[{"id":p["id"]} for p in pairs]}

@router.post("/proposals")
def propose(body: ProposalIn, request: Request):
    writable(request); validate_category(body.category)
    pid=participant(request)
    with db() as con:
        if con.execute("SELECT COUNT(*) FROM video_proposals WHERE participant_id=? AND created_at>?",(pid,time.time()-3600)).fetchone()[0]>=5: raise HTTPException(429,"Proposal limit reached. Try later.")
        if body.source_image and not con.execute("SELECT 1 FROM video_proposals WHERE source_image=? AND participant_id=?",(body.source_image,pid)).fetchone():
            raise HTTPException(400,"Upload source image through an administrator.")
        new_id=ident();con.execute("INSERT INTO video_proposals VALUES(?,?,?,?,?,?,?)",(new_id,pid,body.category,body.prompt,body.source_image,"pending",time.time()))
    return {"id":new_id,"status":"pending"}

@router.get("/arena/next")
def next_pair(request: Request, category: str, challenge_id: str | None = None, pair_id: str | None = None):
    validate_category(category);pid=participant(request)
    with db() as con:
        candidates=con.execute("""SELECT p.id FROM video_pairs p JOIN video_challenges c ON c.id=p.challenge_id WHERE p.status='published' AND c.status='published' AND c.category=? AND (? IS NULL OR p.challenge_id=?) AND (? IS NULL OR p.id=?) AND NOT EXISTS(SELECT 1 FROM video_votes v WHERE v.pair_id=p.id AND v.participant_id=? AND v.source='public') ORDER BY p.created_at""",(category,challenge_id,challenge_id,pair_id,pair_id,pid)).fetchall()
        if not candidates: return {"empty":True,"reason":"No eligible comparisons remain in this category."}
        pair_id=random.choice(candidates)["id"]
        p=pair_valid(con,pair_id)
        a,b=([p["output_1"],p["output_2"]] if secrets.randbelow(2) else [p["output_2"],p["output_1"]])
        sid=ident();con.execute("INSERT INTO video_sessions VALUES(?,?,?,?,?,?)",(sid,pid,pair_id,a,b,time.time()))
        outputs={o["id"]:o for o in pair_outputs(con,pair_id)}
    return {"empty":False,"session_id":sid,"pair_id":pair_id,"challenge":{"id":p["challenge_id"],"title":p["title"],"category":p["category"],"prompt":p["prompt"],"criterion":p["criterion"],"source_image":"/api/video/media/"+p["source_image"] if p["source_image"] else None},"a":output_public(outputs[a]),"b":output_public(outputs[b])}

@router.post("/votes")
def submit_vote(body: VoteIn, request: Request):
    writable(request)
    if body.choice not in CHOICES: raise HTTPException(400,"Invalid vote.")
    pid=participant(request)
    with db() as con:
        s=row(con,"SELECT * FROM video_sessions WHERE id=? AND participant_id=?",(body.session_id,pid))
        p=pair_valid(con,s["pair_id"])
        if {s["a_output"],s["b_output"]}!={p["output_1"],p["output_2"]}:raise HTTPException(400,"Invalid side assignment.")
        existing=con.execute("SELECT * FROM video_votes WHERE participant_id=? AND pair_id=? AND source='public'",(pid,p["id"])).fetchone()
        if existing:
            if existing["session_id"]!=s["id"] or existing["choice"]!=body.choice: raise HTTPException(409,"This comparison already has a vote.")
            vote_id=existing["id"]
        else:
            # Per-participant rate limiting also survives server restarts.
            if con.execute("SELECT COUNT(*) FROM video_votes WHERE participant_id=? AND created_at>?",(pid,time.time()-60)).fetchone()[0]>=20:raise HTTPException(429,"Voting limit reached. Try later.")
            vote_id=ident()
            try: con.execute("INSERT INTO video_votes VALUES(?,?,?,?,?,?,?,?,?,?,?)",(vote_id,pid,p["id"],s["id"],s["a_output"],s["b_output"],body.choice,"public",time.time(),None,None))
            except sqlite3.IntegrityError:
                prior=con.execute("SELECT * FROM video_votes WHERE participant_id=? AND pair_id=? AND source='public'",(pid,p["id"])).fetchone()
                if not prior or prior["session_id"]!=s["id"] or prior["choice"]!=body.choice:raise HTTPException(409,"This comparison already has a vote.")
                vote_id=prior["id"]
        outputs={o["id"]:o for o in pair_outputs(con,p["id"])}
    return {"vote_id":vote_id,"choice":body.choice,"a":output_public(outputs[s["a_output"]],True),"b":output_public(outputs[s["b_output"]],True)}

@router.get("/leaderboard")
def video_leaderboard(category: str, source: str="public"):
    validate_category(category)
    if source not in ("public","team"):raise HTTPException(400,"Unknown evaluation source.")
    with db() as con:
        models=[dict(x) for x in con.execute("SELECT * FROM video_models WHERE active=1 ORDER BY name").fetchall()]
        pairs=con.execute("""SELECT p.id,p.challenge_id,r1.model_id m1,r2.model_id m2 FROM video_pairs p JOIN video_challenges c ON c.id=p.challenge_id JOIN video_outputs o1 ON o1.id=p.output_1 JOIN video_runs r1 ON r1.id=o1.run_id JOIN video_outputs o2 ON o2.id=p.output_2 JOIN video_runs r2 ON r2.id=o2.run_id WHERE p.status='published' AND c.status='published' AND c.category=?""",(category,)).fetchall()
        votes=con.execute("""SELECT v.*,r1.model_id a_model,r2.model_id b_model FROM video_votes v JOIN video_pairs p ON p.id=v.pair_id JOIN video_challenges c ON c.id=p.challenge_id JOIN video_outputs o1 ON o1.id=v.a_output JOIN video_runs r1 ON r1.id=o1.run_id JOIN video_outputs o2 ON o2.id=v.b_output JOIN video_runs r2 ON r2.id=o2.run_id WHERE v.source=? AND v.invalidated_at IS NULL AND p.status='published' AND c.status='published' AND c.category=?""",(source,category)).fetchall()
    stats={m["id"]:{"id":m["id"],"name":m["name"],"provider":m["provider"],"version":m["version"],"wins":0,"losses":0,"ties":0,"both_bad":0,"eligible_comparisons":0,"challenge_coverage":0} for m in models}
    coverage={mid:set() for mid in stats}
    for p in pairs:
        for mid in (p["m1"],p["m2"]):
            if mid in stats: stats[mid]["eligible_comparisons"]+=1;coverage[mid].add(p["challenge_id"])
    for v in votes:
        a,b=v["a_model"],v["b_model"]
        if a not in stats or b not in stats:continue
        choice=v["choice"]
        if choice=="a":stats[a]["wins"]+=1;stats[b]["losses"]+=1
        elif choice=="b":stats[b]["wins"]+=1;stats[a]["losses"]+=1
        elif choice=="tie":stats[a]["ties"]+=1;stats[b]["ties"]+=1
        elif choice=="both-bad":stats[a]["both_bad"]+=1;stats[b]["both_bad"]+=1
    for mid,s in stats.items():
        s["challenge_coverage"]=len(coverage[mid]);den=s["wins"]+s["losses"]+s["ties"]
        s["score"]=(s["wins"]+0.5*s["ties"])/den if den else None
        s["preliminary"]=den<20
    return {"category":category,"source":source,"method":"(wins + 0.5 × ties) / (wins + losses + ties); skips and both-bad excluded","rankings":sorted(stats.values(),key=lambda s:(s["score"] is not None,s["score"] or 0),reverse=True)}

@router.get("/media/{name}")
def media(name: str, request: Request):
    if not re.fullmatch(r"[0-9a-f]{32}\.(mp4|webm|jpg|jpeg|png|webp)",name):raise HTTPException(404)
    with db() as con:
        public=con.execute("""SELECT 1 FROM video_pairs p JOIN video_challenges c ON c.id=p.challenge_id JOIN video_outputs o1 ON o1.id=p.output_1 JOIN video_outputs o2 ON o2.id=p.output_2 WHERE c.status='published' AND p.status='published' AND (o1.video_path=? OR o1.thumbnail_path=? OR o2.video_path=? OR o2.thumbnail_path=? OR c.source_image=?) LIMIT 1""",(name,name,name,name,name)).fetchone()
    if not public:
        with db() as con:
            public=con.execute("SELECT 1 FROM video_challenges WHERE status='published' AND source_image=?",(name,)).fetchone()
    if not public: admin(request)
    target=MEDIA/name
    if not target.is_file():raise HTTPException(404)
    return FileResponse(target,headers={"Cache-Control":"private, max-age=3600"})

@router.get("/admin/overview")
def overview(request: Request):
    admin(request)
    with db() as con:
        return {name:[dict(x) for x in con.execute("SELECT * FROM video_"+name+" ORDER BY created_at DESC").fetchall()] for name in ("models","challenges","runs","outputs","pairs","votes","proposals","vote_flags")}

@router.post("/admin/models")
def create_model(body: ModelIn, request: Request):
    writable(request);admin(request);new_id=ident()
    with db() as con:con.execute("INSERT INTO video_models VALUES(?,?,?,?,?,?)",(new_id,body.name.strip(),body.provider.strip(),body.version.strip(),int(body.active),time.time()))
    return {"id":new_id}

@router.put("/admin/models/{model_id}")
def edit_model(model_id: str, body: ModelIn, request: Request):
    writable(request);admin(request)
    with db() as con:
        row(con,"SELECT id FROM video_models WHERE id=?",(model_id,))
        con.execute("UPDATE video_models SET name=?,provider=?,version=?,active=? WHERE id=?",(body.name.strip(),body.provider.strip(),body.version.strip(),int(body.active),model_id))
        if not body.active:
            con.execute("UPDATE video_pairs SET status='withdrawn' WHERE output_1 IN (SELECT o.id FROM video_outputs o JOIN video_runs r ON r.id=o.run_id WHERE r.model_id=?) OR output_2 IN (SELECT o.id FROM video_outputs o JOIN video_runs r ON r.id=o.run_id WHERE r.model_id=?)",(model_id,model_id))
    return {"id":model_id}

@router.post("/admin/challenges")
def create_challenge(body: ChallengeIn, request: Request):
    writable(request);admin(request);validate_category(body.category)
    if body.category=="image-to-video" and not body.prompt.strip():raise HTTPException(400,"Prompt required.")
    if body.selection_policy!="first-successful" and not body.policy_deviation:raise HTTPException(400,"Explain the output-selection deviation.")
    new_id=ident()
    with db() as con:con.execute("INSERT INTO video_challenges(id,title,category,prompt,criterion,selection_policy,policy_deviation,created_at) VALUES(?,?,?,?,?,?,?,?)",(new_id,body.title.strip(),body.category,body.prompt.strip(),body.criterion.strip(),body.selection_policy,body.policy_deviation,time.time()))
    return {"id":new_id}

@router.put("/admin/challenges/{challenge_id}")
def edit_challenge(challenge_id: str, body: ChallengeIn, request: Request):
    writable(request);admin(request);validate_category(body.category)
    if body.selection_policy!="first-successful" and not (body.policy_deviation or "").strip():raise HTTPException(400,"Explain the output-selection deviation.")
    with db() as con:
        current=row(con,"SELECT * FROM video_challenges WHERE id=?",(challenge_id,))
        if con.execute("SELECT 1 FROM video_runs WHERE challenge_id=?",(challenge_id,)).fetchone() and any(current[k]!=getattr(body,k) for k in ("category","prompt","criterion")):
            raise HTTPException(409,"This challenge has generation history. Create a new challenge to change its category, prompt, or criterion.")
        con.execute("UPDATE video_challenges SET title=?,category=?,prompt=?,criterion=?,selection_policy=?,policy_deviation=? WHERE id=?",(body.title.strip(),body.category,body.prompt.strip(),body.criterion.strip(),body.selection_policy,body.policy_deviation,challenge_id))
    return {"id":challenge_id}

@router.post("/admin/challenges/{challenge_id}/status")
def challenge_status(challenge_id: str, body: StatusIn, request: Request):
    writable(request);admin(request)
    if body.status not in ("draft","published","withdrawn"):raise HTTPException(400,"Invalid status.")
    with db() as con:
        c=row(con,"SELECT * FROM video_challenges WHERE id=?",(challenge_id,))
        if body.status=="published" and c["category"]=="image-to-video" and not c["source_image"]:raise HTTPException(400,"Source image required.")
        con.execute("UPDATE video_challenges SET status=? WHERE id=?",(body.status,challenge_id))
    return {"status":body.status}

@router.post("/admin/runs")
def create_run(body: RunIn, request: Request):
    writable(request);admin(request)
    if body.status not in ("planned","success","failed"):raise HTTPException(400,"Invalid status.")
    if body.attempt>1 and not (body.retry_reason or "").strip():raise HTTPException(400,"Retry reason required.")
    try:date.fromisoformat(body.generated_at)
    except ValueError:raise HTTPException(400,"Use an ISO generation date (YYYY-MM-DD).")
    with db() as con:
        row(con,"SELECT id FROM video_challenges WHERE id=?",(body.challenge_id,));row(con,"SELECT id FROM video_models WHERE id=?",(body.model_id,))
        new_id=ident();con.execute("INSERT INTO video_runs VALUES(?,?,?,?,?,?,?,?,?,?)",(new_id,body.challenge_id,body.model_id,body.platform,body.generated_at,json.dumps(body.settings),body.attempt,body.status,body.retry_reason,time.time()))
    return {"id":new_id}

@router.post("/admin/pairs")
def create_pair(body: PairIn, request: Request):
    writable(request);admin(request)
    if body.output_1==body.output_2:raise HTTPException(400,"Choose different outputs.")
    a,b=sorted((body.output_1,body.output_2))
    with db() as con:
        outputs=[row(con,"SELECT o.id,o.status,r.challenge_id,r.model_id FROM video_outputs o JOIN video_runs r ON r.id=o.run_id WHERE o.id=?",(x,)) for x in (a,b)]
        if outputs[0]["challenge_id"]!=outputs[1]["challenge_id"]:raise HTTPException(400,"Outputs must belong to one challenge.")
        if any(o["status"]!="published" for o in outputs):raise HTTPException(400,"Publish both outputs before pairing.")
        if outputs[0]["model_id"]==outputs[1]["model_id"]:raise HTTPException(400,"Compare different models.")
        challenge,selected=selected_outputs(con,outputs[0]["challenge_id"])
        if challenge["selection_policy"]=="first-successful" and any(selected.get(o["model_id"])!=o["id"] for o in outputs):raise HTTPException(400,"Pair uses a later output. Record a selection-policy deviation first.")
        if con.execute("SELECT 1 FROM video_pairs WHERE output_1=? AND output_2=?",(a,b)).fetchone():raise HTTPException(409,"Pair already exists.")
        new_id=ident();con.execute("INSERT INTO video_pairs VALUES(?,?,?,?,?,?)",(new_id,outputs[0]["challenge_id"],a,b,"draft",time.time()))
    return {"id":new_id}

@router.get("/admin/pairs/{pair_id}/preview")
def preview_pair(pair_id: str, request: Request):
    admin(request)
    with db() as con:
        p=row(con,"SELECT * FROM video_pairs WHERE id=?",(pair_id,));c=row(con,"SELECT * FROM video_challenges WHERE id=?",(p["challenge_id"],));outputs=pair_outputs(con,pair_id)
    return {"pair":p,"challenge":public_challenge(c),"a":output_public(outputs[0]),"b":output_public(outputs[1])}

@router.post("/admin/pairs/{pair_id}/status")
def pair_status(pair_id: str, body: StatusIn, request: Request):
    writable(request);admin(request)
    if body.status not in ("draft","published","withdrawn"):raise HTTPException(400,"Invalid status.")
    with db() as con:
        pair=row(con,"SELECT * FROM video_pairs WHERE id=?",(pair_id,))
        if body.status=="published":
            count=con.execute("SELECT COUNT(*) FROM video_outputs o JOIN video_runs r ON r.id=o.run_id JOIN video_models m ON m.id=r.model_id WHERE o.id IN (?,?) AND o.status='published' AND m.active=1",(pair["output_1"],pair["output_2"])).fetchone()[0]
            if count!=2:raise HTTPException(400,"Both outputs must be published.")
        con.execute("UPDATE video_pairs SET status=? WHERE id=?",(body.status,pair_id))
    return {"status":body.status}

@router.post("/admin/team-votes")
def team_vote(body: TeamVoteIn, request: Request):
    writable(request);uid=admin(request)
    if body.choice not in CHOICES:raise HTTPException(400,"Invalid choice.")
    with db() as con:
        p=pair_valid(con,body.pair_id)
        if {body.a_output,body.b_output}!={p["output_1"],p["output_2"]}:raise HTTPException(400,"Invalid sides.")
        prior=con.execute("SELECT * FROM video_votes WHERE participant_id=? AND pair_id=? AND source='team'",(uid,p["id"])).fetchone()
        if prior:
            if prior["choice"]==body.choice and prior["a_output"]==body.a_output and prior["b_output"]==body.b_output:return {"id":prior["id"]}
            raise HTTPException(409,"You already evaluated this pair.")
        con.execute("INSERT OR IGNORE INTO video_participants(id,token_hash,created_at) VALUES(?,?,?)",(uid,hashlib.sha256(("team:"+uid).encode()).hexdigest(),time.time()))
        vote_id=ident();con.execute("INSERT INTO video_votes VALUES(?,?,?,?,?,?,?,?,?,?,?)",(vote_id,uid,p["id"],None,body.a_output,body.b_output,body.choice,"team",time.time(),None,None))
    return {"id":vote_id}

@router.post("/admin/votes/{vote_id}/invalidate")
def invalidate(vote_id: str, body: FlagIn, request: Request):
    writable(request);admin(request)
    with db() as con:
        row(con,"SELECT id FROM video_votes WHERE id=?",(vote_id,))
        con.execute("UPDATE video_votes SET invalidated_at=?,invalid_reason=? WHERE id=?",(time.time(),body.reason,vote_id))
    return {"id":vote_id,"invalidated":True}

@router.post("/admin/proposals/{proposal_id}/status")
def proposal_status(proposal_id: str, body: StatusIn, request: Request):
    writable(request);admin(request)
    if body.status not in ("pending","reviewed","rejected"):raise HTTPException(400,"Invalid status.")
    with db() as con:
        row(con,"SELECT id FROM video_proposals WHERE id=?",(proposal_id,))
        con.execute("UPDATE video_proposals SET status=? WHERE id=?",(body.status,proposal_id))
    return {"status":body.status}

@router.get("/admin/export/{table}")
def export(table: str, request: Request):
    admin(request)
    if table not in ("challenges","runs","outputs","votes"):raise HTTPException(404)
    import csv,io
    with db() as con:
        cur=con.execute("SELECT * FROM video_"+table)
        stream=io.StringIO();writer=csv.writer(stream);writer.writerow([d[0] for d in cur.description]);writer.writerows(cur.fetchall())
    return Response(stream.getvalue(),media_type="text/csv",headers={"Content-Disposition":f"attachment; filename=selea-{table}.csv"})

ALLOWED={"image":{"image/jpeg":"jpg","image/png":"png","image/webp":"webp"},"video":{"video/mp4":"mp4","video/webm":"webm"}}

def magic_ok(content, ext):
    return (ext=="mp4" and len(content)>12 and content[4:8]==b"ftyp") or (ext=="webm" and content.startswith(b"\x1a\x45\xdf\xa3")) or (ext=="png" and content.startswith(b"\x89PNG\r\n\x1a\n")) or (ext=="jpg" and content.startswith(b"\xff\xd8\xff")) or (ext=="webp" and content.startswith(b"RIFF") and content[8:12]==b"WEBP")

def clean_media(target: Path, kind: str):
    clean=target.with_name(target.stem+"-clean"+target.suffix)
    try:
        if kind=="image":
            Image.MAX_IMAGE_PIXELS=40_000_000
            with Image.open(target) as original:
                if original.width*original.height>40_000_000:raise ValueError("Image dimensions too large.")
                original.verify()
            with Image.open(target) as original:
                oriented=ImageOps.exif_transpose(original)
                fresh=Image.new(oriented.mode,oriented.size)
                fresh.paste(oriented)
                fresh.save(clean,format={"jpg":"JPEG","png":"PNG","webp":"WEBP"}[target.suffix[1:]])
        else:
            command=[imageio_ffmpeg.get_ffmpeg_exe(),"-v","error","-nostdin","-i",str(target),"-map","0:v:0","-map","0:a?","-map_metadata","-1","-map_metadata:s","-1","-map_chapters","-1","-c","copy"]
            if target.suffix==".mp4":command += ["-movflags","+faststart"]
            command += ["-y",str(clean)]
            result=subprocess.run(command,capture_output=True,timeout=300)
            if result.returncode:raise ValueError("Video could not be parsed or normalized: "+result.stderr.decode(errors="replace")[-300:])
        clean.replace(target)
    finally:
        clean.unlink(missing_ok=True)

async def save_upload(upload: UploadFile, kind: str):
    ext=ALLOWED[kind].get(upload.content_type or "")
    if not ext:raise HTTPException(415,"Unsupported media type.")
    limit=200*1024*1024 if kind=="video" else 10*1024*1024
    name=ident()+"."+ext;target=MEDIA/name;size=0;head=b""
    try:
        with target.open("wb") as f:
            while chunk:=await upload.read(1024*1024):
                size+=len(chunk)
                if size>limit:raise HTTPException(413,"File too large.")
                if len(head)<16:head=(head+chunk)[:16]
                f.write(chunk)
        if not size or not magic_ok(head,ext):raise HTTPException(415,"File content does not match its type.")
        try:await asyncio.to_thread(clean_media,target,kind)
        except Exception as exc:raise HTTPException(415,"Media could not be validated: "+str(exc)[:200]) from exc
        return name
    except Exception:
        target.unlink(missing_ok=True);raise

@router.post("/admin/challenges/{challenge_id}/source")
async def upload_source(challenge_id: str, request: Request, file: UploadFile=File(...)):
    writable(request);admin(request)
    with db() as con:
        old=row(con,"SELECT source_image FROM video_challenges WHERE id=?",(challenge_id,))["source_image"]
        if con.execute("SELECT 1 FROM video_runs WHERE challenge_id=?",(challenge_id,)).fetchone():raise HTTPException(409,"Create a new challenge to change a source image after generation has been recorded.")
    name=await save_upload(file,"image")
    try:
        with db() as con:con.execute("UPDATE video_challenges SET source_image=? WHERE id=?",(name,challenge_id))
    except Exception: (MEDIA/name).unlink(missing_ok=True);raise
    if old and old!=name:
        with db() as con:
            used=con.execute("SELECT 1 FROM video_challenges WHERE source_image=? UNION SELECT 1 FROM video_proposals WHERE source_image=?",(old,old)).fetchone()
        if not used:(MEDIA/old).unlink(missing_ok=True)
    return {"source_image":"/api/video/media/"+name}

@router.post("/admin/outputs")
async def upload_output(request: Request, run_id: str=Form(...), duration: float=Form(...), resolution: str=Form(...), audio: bool=Form(False), video: UploadFile=File(...), thumbnail: UploadFile | None=File(None)):
    writable(request);admin(request)
    if duration<=0 or duration>86400 or not re.fullmatch(r"[1-9][0-9]{1,4}x[1-9][0-9]{1,4}",resolution):raise HTTPException(400,"Invalid duration or resolution.")
    with db() as con:
        run=row(con,"SELECT * FROM video_runs WHERE id=?",(run_id,))
        if run["status"]!="success":raise HTTPException(400,"Output requires a successful generation run.")
    saved=[]
    try:
        video_name=await save_upload(video,"video");saved.append(video_name)
        thumbnail_name=await save_upload(thumbnail,"image") if thumbnail else None
        if thumbnail_name:saved.append(thumbnail_name)
        new_id=ident()
        with db() as con:con.execute("INSERT INTO video_outputs(id,run_id,video_path,thumbnail_path,duration,resolution,audio,created_at) VALUES(?,?,?,?,?,?,?,?)",(new_id,run_id,video_name,thumbnail_name,duration,resolution,int(audio),time.time()))
    except Exception:
        for name in saved:(MEDIA/name).unlink(missing_ok=True)
        raise
    return {"id":new_id,"video":"/api/video/media/"+video_name}

@router.post("/proposals/with-image")
async def propose_with_image(request: Request, category: str=Form(...), prompt: str=Form(...), file: UploadFile=File(...)):
    writable(request);validate_category(category);pid=participant(request)
    if len(prompt.strip())<1 or len(prompt)>10000:raise HTTPException(400,"Invalid prompt.")
    with db() as con:
        if con.execute("SELECT COUNT(*) FROM video_proposals WHERE participant_id=? AND created_at>?",(pid,time.time()-3600)).fetchone()[0]>=5:raise HTTPException(429,"Proposal limit reached. Try later.")
    name=await save_upload(file,"image")
    try:
        new_id=ident()
        with db() as con:con.execute("INSERT INTO video_proposals VALUES(?,?,?,?,?,?,?)",(new_id,pid,category,prompt.strip(),name,"pending",time.time()))
    except Exception:(MEDIA/name).unlink(missing_ok=True);raise
    return {"id":new_id,"status":"pending"}

class GenerateIn(BaseModel):
    challenge_id: str

def selected_outputs(con, challenge_id):
    challenge=row(con,"SELECT * FROM video_challenges WHERE id=?",(challenge_id,))
    candidates=con.execute("""SELECT o.id,o.status,r.model_id,r.generated_at,r.attempt,o.created_at FROM video_outputs o JOIN video_runs r ON r.id=o.run_id WHERE r.challenge_id=? AND r.status='success' ORDER BY r.generated_at,r.attempt,o.created_at""",(challenge_id,)).fetchall()
    selected={}
    for candidate in candidates:
        if candidate["model_id"] not in selected:selected[candidate["model_id"]]=candidate["id"] if candidate["status"]=="published" else None
    return challenge,selected

@router.post("/admin/pairs/generate")
def generate_pairs(body: GenerateIn, request: Request):
    writable(request);admin(request)
    with db() as con:
        _,selected=selected_outputs(con,body.challenge_id)
        ids=[x for x in selected.values() if x];created=[]
        for i in range(len(ids)):
            for j in range(i+1,len(ids)):
                a,b=sorted((ids[i],ids[j]))
                if con.execute("SELECT 1 FROM video_pairs WHERE output_1=? AND output_2=?",(a,b)).fetchone():continue
                pair_id=ident();con.execute("INSERT INTO video_pairs VALUES(?,?,?,?,?,?)",(pair_id,body.challenge_id,a,b,"draft",time.time()));created.append(pair_id)
    return {"created":created}

@router.post("/admin/votes/{vote_id}/flag")
def flag_vote(vote_id: str, body: FlagIn, request: Request):
    writable(request);uid=admin(request)
    with db() as con:
        row(con,"SELECT id FROM video_votes WHERE id=?",(vote_id,))
        flag_id=ident();con.execute("INSERT INTO video_vote_flags VALUES(?,?,?,?,?)",(flag_id,vote_id,uid,body.reason,time.time()))
    return {"id":flag_id}

@router.post("/admin/outputs/{output_id}/status")
def output_status(output_id: str, body: StatusIn, request: Request):
    writable(request);admin(request)
    if body.status not in ("draft","published","withdrawn"):raise HTTPException(400,"Invalid status.")
    with db() as con:
        row(con,"SELECT id FROM video_outputs WHERE id=?",(output_id,))
        con.execute("UPDATE video_outputs SET status=? WHERE id=?",(body.status,output_id))
        if body.status!="published":
            con.execute("UPDATE video_pairs SET status='withdrawn' WHERE output_1=? OR output_2=?",(output_id,output_id))
    return {"status":body.status}


@router.get("/models")
def public_video_models():
    with db() as con:
        models=con.execute("SELECT * FROM video_models WHERE active=1 ORDER BY name").fetchall()
        result=[]
        for model in models:
            pairs=con.execute("""SELECT DISTINCT p.id,c.category FROM video_pairs p JOIN video_challenges c ON c.id=p.challenge_id
                JOIN video_outputs o ON (o.id=p.output_1 OR o.id=p.output_2) JOIN video_runs r ON r.id=o.run_id
                WHERE r.model_id=? AND p.status='published' AND c.status='published' AND o.status='published'""",(model["id"],)).fetchall()
            if pairs:result.append({"id":model["id"],"name":model["name"],"provider":model["provider"],"version":model["version"],"comparisons":len(pairs),"categories":sorted({p["category"] for p in pairs})})
    return result
