import asyncio
import hashlib
import json
import os
import secrets
import sqlite3
import time
import uuid
from collections import defaultdict, deque
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, Response
from pydantic import BaseModel, Field

DB = Path(os.environ.get("ARENA_DATABASE", Path(__file__).resolve().parents[1] / "arena.db"))
app = FastAPI(title="Selea Arena API")
limits = defaultdict(deque)
locks = {}
# Credentials live only in this process, keyed by the current session, never SQLite.
session_credentials = {}


def credential_token(request):
    return hashlib.sha256(request.cookies.get("arena_session", "").encode()).hexdigest()


def credentials_for(request):
    now = time.time()
    for token in list(session_credentials):
        if session_credentials[token]["expires"] <= now:
            session_credentials.pop(token, None)
    return session_credentials.get(credential_token(request), {}).get("keys", {})


def db():
    connection = sqlite3.connect(DB, timeout=15)
    connection.row_factory = sqlite3.Row
    return connection


def init_db():
    with db() as connection:
        connection.executescript("""
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, email TEXT UNIQUE, name TEXT, password TEXT);
    CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, owner TEXT, expires REAL);
    CREATE TABLE IF NOT EXISTS chats(id TEXT PRIMARY KEY, owner TEXT, title TEXT, data TEXT, updated REAL);
        """)


init_db()


def issue_session(response, owner):
    token = secrets.token_urlsafe(32)
    with db() as connection:
        connection.execute("INSERT INTO sessions VALUES(?,?,?)",
                           (hashlib.sha256(token.encode()).hexdigest(), owner, time.time() + 86400))
    response.set_cookie("arena_session", token, httponly=True, samesite="strict", max_age=86400,
                        secure=os.getenv("COOKIE_SECURE") == "true", path="/")


def owner(request):
    token = hashlib.sha256(request.cookies.get("arena_session", "").encode()).hexdigest()
    with db() as connection:
        row = connection.execute("SELECT owner FROM sessions WHERE token=? AND expires>?", (token, time.time())).fetchone()
    if not row:
        raise HTTPException(401, "Session expired. Reload the page.")
    return row["owner"]


def user_info(identity):
    with db() as connection:
        row = connection.execute("SELECT id,name,email FROM users WHERE id=?", (identity,)).fetchone()
    return dict(row) if row else None


def throttle(identity):
    now = time.time()
    queue = limits[identity]
    while queue and queue[0] < now - 60:
        queue.popleft()
    if len(queue) >= 20:
        raise HTTPException(429, "Please wait a minute before trying again.")
    queue.append(now)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/session")
def session(request: Request, response: Response):
    try:
        identity = owner(request)
    except HTTPException:
        identity = "guest-" + uuid.uuid4().hex
        issue_session(response, identity)
    return {"user": user_info(identity)}


class Account(BaseModel):
    email: str = Field(min_length=3, max_length=200)
    password: str = Field(min_length=8, max_length=128)
    name: str = Field(default="", max_length=40)


def password_hash(password, salt):
    return hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), 300_000).hex()


@app.post("/api/auth/{action}")
def authenticate(action: str, body: Account, request: Request, response: Response):
    identity = owner(request)
    throttle(request.client.host if request.client else "local")
    email = body.email.strip().lower()
    if "@" not in email or action not in ("login", "register"):
        raise HTTPException(400, "Enter a valid email and account action.")
    with db() as connection:
        existing = connection.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
        if action == "register":
            if existing:
                raise HTTPException(409, "An account with this email already exists.")
            salt = secrets.token_hex(16)
            uid = uuid.uuid4().hex
            connection.execute("INSERT INTO users VALUES(?,?,?,?)",
                               (uid, email, body.name.strip() or email.split("@")[0], salt + ":" + password_hash(body.password, salt)))
        else:
            salt = existing["password"].split(":")[0] if existing else "00" * 16
            candidate = password_hash(body.password, salt)
            if not existing or not secrets.compare_digest(candidate, existing["password"].split(":")[1]):
                raise HTTPException(401, "Incorrect email or password.")
            uid = existing["id"]
        if identity.startswith("guest-"):
            connection.execute("UPDATE chats SET owner=? WHERE owner=?", (uid, identity))
        connection.execute("DELETE FROM sessions WHERE token=?", (hashlib.sha256(request.cookies.get("arena_session", "").encode()).hexdigest(),))
    session_credentials.pop(credential_token(request), None)
    issue_session(response, uid)
    return {"user": user_info(uid)}


@app.post("/api/logout")
def logout(request: Request, response: Response):
    session_credentials.pop(credential_token(request), None)
    with db() as connection:
        connection.execute("DELETE FROM sessions WHERE token=?", (hashlib.sha256(request.cookies.get("arena_session", "").encode()).hexdigest(),))
    issue_session(response, "guest-" + uuid.uuid4().hex)
    return {"user": None}


class Credential(BaseModel):
    provider: str = Field(pattern="^(openai|anthropic|xai)$")
    key: str = Field(default="", max_length=512)


@app.get("/api/credentials")
def credential_status(request: Request):
    owner(request)
    return {"configured": list(credentials_for(request))}


@app.post("/api/credentials")
def save_credential(body: Credential, request: Request):
    identity = owner(request)
    throttle(identity)
    token = credential_token(request)
    keys = dict(credentials_for(request))
    if body.key.strip():
        keys[body.provider] = body.key.strip()
    else:
        keys.pop(body.provider, None)
    with db() as connection:
        expiry = connection.execute("SELECT expires FROM sessions WHERE token=?", (token,)).fetchone()[0]
    session_credentials[token] = {"keys": keys, "expires": expiry}
    return {"configured": list(keys)}


class Model(BaseModel):
    provider: str = Field(pattern="^(demo|openai|anthropic|xai)$")
    id: str = Field(min_length=1, max_length=100, pattern=r"^[a-zA-Z0-9._:/-]+$")


class Prompt(BaseModel):
    chat_id: str | None = None
    mode: str = Field(pattern="^(battle|compare|direct|agent)$")
    prompt: str = Field(min_length=1, max_length=12000)
    models: list[Model] = Field(min_length=1, max_length=2)
    keys: dict[str, str] = Field(default_factory=dict)


def load_chat(chat_id, identity):
    with db() as connection:
        row = connection.execute("SELECT * FROM chats WHERE id=? AND owner=?", (chat_id, identity)).fetchone()
    if not row:
        raise HTTPException(404, "Chat not found.")
    return json.loads(row["data"])


def public_chat(chat):
    result = json.loads(json.dumps(chat))
    if chat["mode"] == "battle" and not chat.get("vote"):
        result["models"] = [{"provider": "hidden", "id": f"Model {letter}"} for letter in ("A", "B")]
    return result


def store_chat(chat, identity):
    with db() as connection:
        connection.execute("INSERT OR REPLACE INTO chats VALUES(?,?,?,?,?)",
                           (chat["id"], identity, chat["title"], json.dumps(chat), time.time()))


@app.get("/api/chats")
def chats(request: Request):
    with db() as connection:
        rows = connection.execute("SELECT id,title,updated FROM chats WHERE owner=? ORDER BY updated DESC", (owner(request),)).fetchall()
    return [dict(row) for row in rows]


@app.get("/api/chats/{chat_id}")
def chat(chat_id: str, request: Request):
    return public_chat(load_chat(chat_id, owner(request)))


async def answer(model, messages, key, agent, budget):
    if model["provider"] == "demo":
        await asyncio.sleep(.4)
        if agent:
            return {"text": "Here is a self-contained starter page. Open Preview to inspect it.",
                    "html": '<!doctype html><html><meta name="viewport" content="width=device-width"><style>body{margin:0;background:#f1f0e9;color:#242422;font:18px system-ui;padding:8vw}small{text-transform:uppercase;letter-spacing:3px}h1{font:80px Georgia;max-width:700px}button{background:#242422;color:white;border:0;padding:18px 32px;border-radius:30px}</style><small>Demo artifact</small><h1>Make room for your next idea.</h1><p>A starting point for something extraordinary.</p><button onclick="this.textContent=\'You’re ready to go\'">Get started →</button></html>',
                    "error": False}
        prompt = messages[-1]["content"]
        variant = model["id"].endswith("b")
        text = ("I would start by clarifying the goal, then compare the alternatives.\n\n"
                "1. Define what success looks like.\n2. Test the smallest useful version.\n3. Use the results to choose the next step."
                if variant else "A practical approach is to break the problem into smaller decisions.\n\n"
                "• Establish the constraints.\n• Explore two possible approaches.\n• Check the outcome against your original goal.")
        return {"text": f"Demo response to “{prompt[:160]}”\n\n{text}\n\nConnect a provider in Settings for a real model response.", "error": False}
    if not key:
        return {"text": "Add this provider’s API key in Settings, then retry.", "error": True}
    reserved_cost = 0.0
    try:
        import litellm
        litellm.suppress_debug_info = True
        from litellm import acompletion
        system = "Be helpful, precise and clear."
        if agent:
            system += " Build a self-contained HTML page with embedded CSS and JS. Return the full page in one fenced html block."
        full_messages = [{"role": "system", "content": system}] + messages
        model_id = model["provider"] + "/" + model["id"]
        max_tokens = 1800 if agent else 700
        try:
            tokens = litellm.token_counter(model=model_id, messages=full_messages)
            input_cost, output_cost = litellm.cost_per_token(model=model_id, prompt_tokens=tokens, completion_tokens=max_tokens)
            reserved_cost = (input_cost + output_cost) * 1.25
            if reserved_cost <= 0 or reserved_cost > budget:
                return {"text": "This request exceeds the remaining $2 chat budget, or model pricing is unavailable.", "error": True}
        except Exception:
            return {"text": "Pricing for this model is unavailable. Choose a model with known pricing to enforce the $2 chat budget.", "error": True}
        response = await acompletion(model=model["provider"] + "/" + model["id"],
                                     api_key=key, messages=full_messages,
                                     max_tokens=max_tokens, timeout=45, num_retries=0)
        text = response.choices[0].message.content or ""
        html = None
        if agent and "```html" in text:
            html = text.split("```html", 1)[1].split("```", 1)[0].strip()
        return {"text": text, "html": html, "error": False, "reserved_cost_usd": reserved_cost}
    except Exception:
        return {"text": "Provider request failed. Check the key, model ID and provider balance, then retry.", "error": True, "reserved_cost_usd": reserved_cost}


@app.post("/api/chat")
async def send(body: Prompt, request: Request):
    identity = owner(request)
    throttle(identity)
    lock = locks.setdefault(identity, asyncio.Lock())
    if lock.locked():
        raise HTTPException(409, "A response is already being generated.")
    async with lock:
        if body.chat_id:
            data = load_chat(body.chat_id, identity)
            if data.get("vote"):
                raise HTTPException(409, "This battle has been voted on. Start a new chat.")
        else:
            models = [model.model_dump() for model in body.models]
            if body.mode in ("battle", "compare"):
                if len(models) != 2 or models[0] == models[1]:
                    raise HTTPException(400, "Choose two different models.")
                if body.mode == "battle":
                    secrets.SystemRandom().shuffle(models)
            else:
                models = models[:1]
            data = {"id": uuid.uuid4().hex, "title": body.prompt[:65], "mode": body.mode, "models": models, "turns": [], "vote": None}
        if len(data["turns"]) >= 10:
            raise HTTPException(400, "This chat has reached its 10-turn limit. Start a new chat.")
        responses = []
        tasks = []
        for index, model in enumerate(data["models"]):
            history = []
            for turn in data["turns"]:
                if not turn["responses"][index]["error"]:
                    history += [{"role": "user", "content": turn["prompt"]},
                                {"role": "assistant", "content": turn["responses"][index]["text"]}]
            history.append({"role": "user", "content": body.prompt})
            budget = max(0, 2 - data.get("reserved_cost_usd", 0)) / len(data["models"])
            tasks.append(answer(model, history, body.keys.get(model["provider"]) or credentials_for(request).get(model["provider"]) or os.getenv(model["provider"].upper() + "_API_KEY"), data["mode"] == "agent", budget))
        responses = await asyncio.gather(*tasks)
        data["reserved_cost_usd"] = data.get("reserved_cost_usd", 0) + sum(r.get("reserved_cost_usd", 0) for r in responses)
        data["turns"].append({"prompt": body.prompt, "responses": responses})
        store_chat(data, identity)
        return public_chat(data)


class Vote(BaseModel):
    choice: str = Field(pattern="^(a|b|tie|neither)$")


@app.post("/api/chats/{chat_id}/vote")
async def vote(chat_id: str, body: Vote, request: Request):
    identity = owner(request)
    async with locks.setdefault(identity, asyncio.Lock()):
        data = load_chat(chat_id, identity)
        if data["mode"] not in ("battle", "compare") or not data["turns"] or any(r["error"] for r in data["turns"][-1]["responses"]):
            raise HTTPException(400, "Two successful responses are required to vote.")
        if not data.get("vote"):
            data["vote"] = body.choice
            store_chat(data, identity)
        return public_chat(data)


@app.get("/api/leaderboard")
def leaderboard(request: Request):
    identity = owner(request)
    with db() as connection:
        rows = connection.execute("SELECT data FROM chats WHERE owner=?", (identity,)).fetchall()
    return rank_chats([json.loads(row["data"]) for row in rows])


@app.get("/api/models")
def model_catalog():
    # A local metadata snapshot, not a claim of live provider availability.
    from litellm import model_cost
    catalog = [
        {"id": "demo-a", "name": "Demo A", "provider": "demo", "context": None, "output": None, "input_cost": 0, "output_cost": 0},
        {"id": "demo-b", "name": "Demo B", "provider": "demo", "context": None, "output": None, "input_cost": 0, "output_cost": 0},
    ]
    entries = {
        "openai": ["gpt-4.1", "gpt-4.1-mini", "gpt-4.1-nano", "gpt-4o", "gpt-4o-mini", "o4-mini"],
        "anthropic": ["claude-sonnet-4-5", "claude-haiku-4-5", "claude-opus-4-5"],
        "xai": ["grok-4.3", "grok-4.5", "grok-4.6"],
    }
    for provider, ids in entries.items():
        for model_id in ids:
            metadata = model_cost.get(provider + "/" + model_id) or model_cost.get(model_id)
            if not metadata or metadata.get("mode") != "chat":
                continue
            name = model_id.replace("gpt-", "GPT-").replace("grok-", "Grok ")
            if provider == "anthropic":
                name = model_id.replace("-4-5", " 4.5").replace("-", " ").title()
            catalog.append({
                "id": model_id, "name": name, "provider": provider,
                "context": metadata.get("max_input_tokens"),
                "output": metadata.get("max_output_tokens"),
                "input_cost": metadata.get("input_cost_per_token"),
                "output_cost": metadata.get("output_cost_per_token"),
            })
    return {"models": catalog, "source": "Installed LiteLLM catalog. Prices are estimates, not live quotes."}


def rank_chats(chats):
    scores = {}
    for data in chats:
        if not data.get("vote"):
            continue
        for index, model in enumerate(data["models"]):
            key = model["provider"] + "/" + model["id"]
            score = scores.setdefault(key, {**model, "votes": 0, "wins": 0, "ties": 0})
            score["votes"] += 1
            score["wins"] += data["vote"] == ("a" if index == 0 else "b")
            score["ties"] += data["vote"] == "tie"
    return sorted(scores.values(), key=lambda value: (value["wins"] + value["ties"] * .5) / value["votes"], reverse=True)


@app.get("/api/leaderboard/overview")
def leaderboard_overview(request: Request, category: str = "overview"):
    categories = {
        "overview", "capabilities", "alignment", "text", "search", "vision",
        "document", "webdev", "image-to-webdev", "text-to-image",
        "single-image-edit", "multi-image-edit", "text-to-video",
        "image-to-video", "video-edit",
    }
    if category not in categories:
        raise HTTPException(400, "Unknown leaderboard category.")
    with db() as connection:
        rows = connection.execute(
            "SELECT data,updated FROM chats WHERE owner=? ORDER BY updated DESC",
            (owner(request),),
        ).fetchall()
    chats = [{**json.loads(row["data"]), "updated": row["updated"]} for row in rows]
    if category == "overview":
        selected = chats
    elif category == "text":
        selected = [chat for chat in chats if chat["mode"] in ("battle", "compare", "direct")]
    elif category in ("capabilities", "webdev"):
        selected = [chat for chat in chats if chat["mode"] == "agent"]
    else:
        selected = []
    recent = []
    for chat in selected[:8]:
        public = public_chat(chat)
        failed = bool(chat["turns"]) and any(answer["error"] for answer in chat["turns"][-1]["responses"])
        recent.append({
            "id": chat["id"], "title": chat["title"], "mode": chat["mode"],
            "models": public["models"], "updated": chat["updated"],
            "status": "error" if failed else "voted" if chat.get("vote") else "complete",
        })
    return {
        "category": category,
        "supported": category in ("overview", "text", "capabilities", "webdev"),
        "total_sessions": len(chats),
        "category_sessions": len(selected),
        "total_votes": sum(bool(chat.get("vote")) for chat in selected),
        "rankings": rank_chats(selected),
        "recent": recent,
    }
