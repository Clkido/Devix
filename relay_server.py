"""
SezSpoofer Relay Server
Deploy to Railway, Render, or Fly.io (all free tiers available).
Set RELAY_URL in sezspoofer.py to your deployed URL.
"""

from flask import Flask, request, jsonify
import json, os, random, string, uuid
from datetime import datetime

app = Flask(__name__)
DATA_FILE = "data.json"

# ─── Storage ──────────────────────────────────────────────────────────────────

def load():
    if os.path.exists(DATA_FILE):
        with open(DATA_FILE) as f:
            return json.load(f)
    return {"sessions": {}, "scans": {}, "queues": {}, "results": {}}

def save(data):
    with open(DATA_FILE, "w") as f:
        json.dump(data, f, indent=2)

def gen_code():
    return "".join(random.choices(string.digits, k=8))

# ─── Session routes ───────────────────────────────────────────────────────────

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})

@app.route("/session/create", methods=["POST"])
def create_session():
    data = load()
    code = gen_code()
    while code in data["sessions"]:
        code = gen_code()
    data["sessions"][code] = {"assets": [], "created": str(datetime.utcnow())}
    data["scans"][code]    = {"assets": None}
    # Queue structure: ordered list of entries with status tracking
    data["queues"][code]   = {
        "entries":  [],        # ordered list of requests
        "current":  None,      # request_id currently being processed
        "done":     [],        # request_ids already finished
    }
    save(data)
    return jsonify({"code": code})

@app.route("/session/update/<code>", methods=["POST"])
def update_session(code):
    data = load()
    if code not in data["sessions"]:
        return jsonify({"error": "Invalid code"}), 404
    data["sessions"][code]["assets"] = request.json.get("assets", [])
    save(data)
    return jsonify({"ok": True})

@app.route("/session/<code>", methods=["GET"])
def get_session(code):
    data = load()
    if code not in data["sessions"]:
        return jsonify({"error": "Invalid code"}), 404
    return jsonify(data["sessions"][code])

# ─── Plugin scan relay ────────────────────────────────────────────────────────

@app.route("/scan/<code>", methods=["POST"])
def post_scan(code):
    data = load()
    if code not in data.get("scans", {}):
        return jsonify({"error": "Invalid code"}), 404
    data["scans"][code]["assets"] = request.json.get("assets", [])
    save(data)
    return jsonify({"ok": True})

@app.route("/scan/<code>", methods=["GET"])
def get_scan(code):
    data = load()
    if code not in data.get("scans", {}):
        return jsonify({"error": "Invalid code"}), 404
    return jsonify(data["scans"][code])

# ─── Queue routes ─────────────────────────────────────────────────────────────

@app.route("/request/<code>", methods=["POST"])
def post_request(code):
    """Customer submits a grant request — gets back their position in queue."""
    data = load()
    if code not in data.get("queues", {}):
        return jsonify({"error": "Invalid code"}), 404
    universe_id = request.json.get("universe_id")
    if not universe_id:
        return jsonify({"error": "universe_id required"}), 400

    queue = data["queues"][code]

    # Prevent duplicate requests from same universe
    for entry in queue["entries"]:
        if entry["universe_id"] == universe_id and entry["status"] != "done":
            pos = next(
                (i for i, e in enumerate(queue["entries"])
                 if e["id"] == entry["id"] and e["status"] == "waiting"),
                0
            )
            return jsonify({
                "request_id": entry["id"],
                "position":   pos,
                "total":      len([e for e in queue["entries"] if e["status"] != "done"]),
                "duplicate":  True,
            })

    request_id = str(uuid.uuid4())[:8]
    queue["entries"].append({
        "id":          request_id,
        "universe_id": universe_id,
        "status":      "waiting",   # waiting | processing | done
        "timestamp":   str(datetime.utcnow()),
    })
    save(data)

    waiting = [e for e in queue["entries"] if e["status"] == "waiting"]
    position = len(waiting) - 1  # 0-indexed; 0 = next up
    total    = len(waiting)

    return jsonify({
        "request_id": request_id,
        "position":   position,
        "total":      total,
    })

@app.route("/queue/<code>/<request_id>", methods=["GET"])
def get_queue_position(code, request_id):
    """Customer polls this to see their current queue position."""
    data = load()
    if code not in data.get("queues", {}):
        return jsonify({"error": "Invalid code"}), 404

    queue   = data["queues"][code]
    entries = queue["entries"]

    entry = next((e for e in entries if e["id"] == request_id), None)
    if not entry:
        return jsonify({"error": "Request not found"}), 404

    if entry["status"] == "done":
        return jsonify({"status": "done", "position": 0, "total": 0})

    if entry["status"] == "processing":
        return jsonify({"status": "processing", "position": 0, "total": 0})

    # Count how many "waiting" entries are ahead of this one
    position = 0
    for e in entries:
        if e["id"] == request_id:
            break
        if e["status"] == "waiting":
            position += 1

    total_waiting = len([e for e in entries if e["status"] in ("waiting", "processing")])

    return jsonify({
        "status":   "waiting",
        "position": position,
        "total":    total_waiting,
    })

@app.route("/queue/<code>/stats", methods=["GET"])
def get_queue_stats(code):
    """Lightweight endpoint — returns total waiting count for display."""
    data = load()
    if code not in data.get("queues", {}):
        return jsonify({"error": "Invalid code"}), 404
    queue = data["queues"][code]
    waiting    = len([e for e in queue["entries"] if e["status"] == "waiting"])
    processing = len([e for e in queue["entries"] if e["status"] == "processing"])
    done       = len([e for e in queue["entries"] if e["status"] == "done"])
    return jsonify({"waiting": waiting, "processing": processing, "done": done})

# ─── Provider queue polling ───────────────────────────────────────────────────

@app.route("/requests/<code>", methods=["GET"])
def get_next_request(code):
    """
    Provider CLI polls this. Returns the next waiting entry (one at a time).
    Marks it as 'processing'. Does NOT clear the queue.
    """
    data = load()
    if code not in data.get("queues", {}):
        return jsonify({"error": "Invalid code"}), 404

    queue = data["queues"][code]

    # Find the first waiting entry
    next_entry = next((e for e in queue["entries"] if e["status"] == "waiting"), None)
    if not next_entry:
        return jsonify({"next": None, "queue_length": 0})

    # Mark as processing
    next_entry["status"] = "processing"
    queue["current"] = next_entry["id"]

    waiting_after = len([e for e in queue["entries"] if e["status"] == "waiting"])
    save(data)

    return jsonify({
        "next":         next_entry,
        "queue_length": waiting_after + 1,  # including the one now processing
        "position_num": len([e for e in queue["entries"] if e["status"] in ("done",)]) + 1,
    })

# ─── Result routes ────────────────────────────────────────────────────────────

@app.route("/result/<code>", methods=["POST"])
def post_result(code):
    """Provider posts grant results; marks queue entry as done."""
    data = load()
    if "results" not in data:
        data["results"] = {}

    universe_id = request.json.get("universe_id")
    request_id  = request.json.get("request_id")
    key = f"{code}_{universe_id}"

    data["results"][key] = {
        "results":   request.json.get("results", []),
        "timestamp": str(datetime.utcnow()),
    }

    # Mark queue entry as done
    if code in data.get("queues", {}):
        queue = data["queues"][code]
        for entry in queue["entries"]:
            if entry["id"] == request_id:
                entry["status"] = "done"
                break
        queue["current"] = None
        queue["done"].append(request_id)

    save(data)
    return jsonify({"ok": True})

@app.route("/result/<code>/<universe_id>", methods=["GET"])
def get_result(code, universe_id):
    data = load()
    key = f"{code}_{universe_id}"
    if key not in data.get("results", {}):
        return jsonify({"error": "Not ready yet"}), 404
    return jsonify(data["results"][key])

# ─── Run ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
