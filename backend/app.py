import os
import uuid

from flask import Flask, jsonify, request, redirect, abort
from flask_cors import CORS
from werkzeug.utils import secure_filename
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

BUCKET_NAME = "scores"
ALLOWED_EXTENSIONS = {"pdf"}
MAX_CONTENT_LENGTH = 64 * 1024 * 1024


def create_app():
    app = Flask(__name__)
    app.config["MAX_CONTENT_LENGTH"] = MAX_CONTENT_LENGTH

    supabase: Client = create_client(
        os.environ.get("SUPABASE_URL"),
        os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    )

    CORS(app)
    register_routes(app, supabase)
    return app


def allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def register_routes(app: Flask, supabase: Client):
    @app.get("/api/health")
    def health():
        return jsonify({"status": "ok"})

    @app.get("/api/scores")
    def list_scores():
        res = supabase.table("scores").select("*").order("updated_at", desc=True).execute()
        return jsonify(res.data)

    @app.post("/api/scores")
    def upload_score():
        if "file" not in request.files:
            return jsonify({"error": "No file part named 'file' in request"}), 400

        file = request.files["file"]
        if file.filename == "":
            return jsonify({"error": "No file selected"}), 400
        if not allowed_file(file.filename):
            return jsonify({"error": "Only PDF files are supported"}), 400

        title = request.form.get("title") or os.path.splitext(file.filename)[0]
        page_count = request.form.get("pageCount", type=int) or 0

        original_filename = secure_filename(file.filename)
        stored_filename = f"{uuid.uuid4().hex}.pdf"
        file_bytes = file.read()

        try:
            supabase.storage.from_(BUCKET_NAME).upload(
                path=stored_filename,
                file=file_bytes,
                file_options={"content-type": "application/pdf"}
            )
        except Exception as e:
            return jsonify({"error": f"Failed to upload file to storage: {str(e)}"}), 500

        payload = {
            "title": title,
            "filename": stored_filename,
            "original_filename": original_filename,
            "page_count": page_count,
        }
        res = supabase.table("scores").insert(payload).execute()
        return jsonify(res.data[0]), 201

    @app.get("/api/scores/<int:score_id>")
    def get_score(score_id):
        res = supabase.table("scores").select("*").eq("id", score_id).execute()
        if not res.data:
            abort(404)
        return jsonify(res.data[0])

    @app.patch("/api/scores/<int:score_id>")
    def update_score(score_id):
        payload = request.get_json(silent=True) or {}
        update_data = {}

        if "title" in payload:
            update_data["title"] = payload["title"]
        if "pageCount" in payload:
            update_data["page_count"] = payload["pageCount"]
        if "lastOpenedPage" in payload:
            update_data["last_opened_page"] = payload["lastOpenedPage"]

        if not update_data:
            res = supabase.table("scores").select("*").eq("id", score_id).execute()
            if not res.data:
                abort(404)
            return jsonify(res.data[0])

        res = supabase.table("scores").update(update_data).eq("id", score_id).execute()
        if not res.data:
            abort(404)

        return jsonify(res.data[0])

    @app.delete("/api/scores/<int:score_id>")
    def delete_score(score_id):
        score_res = supabase.table("scores").select("filename").eq("id", score_id).execute()
        if not score_res.data:
            abort(404)

        filename = score_res.data[0]["filename"]
        supabase.storage.from_(BUCKET_NAME).remove([filename])
        supabase.table("scores").delete().eq("id", score_id).execute()
        return "", 204
    
    @app.get("/api/scores/<int:score_id>/file")
    def get_score_file(score_id):
        score_res = supabase.table("scores").select("filename").eq("id", score_id).execute()
        if not score_res.data:
            abort(404)

        filename = score_res.data[0]["filename"]
        signed_url_res = supabase.storage.from_(BUCKET_NAME).create_signed_url(filename, 3600)
        return redirect(signed_url_res["signedUrl"])

    @app.get("/api/scores/<int:score_id>/annotations")
    def list_annotations(score_id):
        score_res = supabase.table("scores").select("id").eq("id", score_id).execute()
        if not score_res.data:
            abort(404)

        res = supabase.table("page_annotations").select("*").eq("score_id", score_id).execute()
        return jsonify(res.data)

    @app.put("/api/scores/<int:score_id>/annotations/<int:page_number>")
    def upsert_annotation(score_id, page_number):
        score_res = supabase.table("scores").select("id").eq("id", score_id).execute()
        if not score_res.data:
            abort(404)

        payload = request.get_json(silent=True) or {}
        strokes = payload.get("strokes")
        if strokes is None:
            return jsonify({"error": "Body must include a 'strokes' array"}), 400

        annotation_data = {
            "score_id": score_id,
            "page_number": page_number,
            "data": strokes,
        }

        res = supabase.table("page_annotations").upsert(
            annotation_data, on_conflict="score_id,page_number"
        ).execute()

        return jsonify(res.data[0])

    @app.delete("/api/scores/<int:score_id>/annotations/<int:page_number>")
    def clear_annotation(score_id, page_number):
        supabase.table("page_annotations").delete().eq("score_id", score_id).eq("page_number", page_number).execute()
        return "", 204

app = create_app()

if __name__ == "__main__":
    app.run(debug=True, port=5001)
