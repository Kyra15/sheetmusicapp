import os
import uuid

from flask import Flask, jsonify, request, send_from_directory, abort
from flask_cors import CORS
from werkzeug.utils import secure_filename

from models import db, Score, PageAnnotation

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
STORAGE_DIR = os.path.join(BASE_DIR, "storage")
ALLOWED_EXTENSIONS = {"pdf"}
MAX_CONTENT_LENGTH = 64 * 1024 * 1024


def create_app():
    os.makedirs(STORAGE_DIR, exist_ok=True)

    app = Flask(__name__)
    app.config["SQLALCHEMY_DATABASE_URI"] = f"sqlite:///{os.path.join(BASE_DIR, 'database.db')}"
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    app.config["MAX_CONTENT_LENGTH"] = MAX_CONTENT_LENGTH

    CORS(app)
    db.init_app(app)

    with app.app_context():
        db.create_all()

    register_routes(app)
    return app


def allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def register_routes(app: Flask):
    @app.get("/api/health")
    def health():
        return jsonify({"status": "ok"})

    @app.get("/api/scores")
    def list_scores():
        scores = Score.query.order_by(Score.updated_at.desc()).all()
        return jsonify([s.to_dict() for s in scores])

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
        file.save(os.path.join(STORAGE_DIR, stored_filename))

        score = Score(
            title=title,
            filename=stored_filename,
            original_filename=original_filename,
            page_count=page_count,
        )
        db.session.add(score)
        db.session.commit()
        return jsonify(score.to_dict()), 201

    @app.get("/api/scores/<int:score_id>")
    def get_score(score_id):
        score = db.session.get(Score, score_id) or abort(404)
        return jsonify(score.to_dict())

    @app.patch("/api/scores/<int:score_id>")
    def update_score(score_id):
        score = db.session.get(Score, score_id) or abort(404)
        payload = request.get_json(silent=True) or {}
        if "title" in payload:
            score.title = payload["title"]
        if "pageCount" in payload:
            score.page_count = payload["pageCount"]
        if "lastOpenedPage" in payload:
            score.last_opened_page = payload["lastOpenedPage"]
        db.session.commit()
        return jsonify(score.to_dict())

    @app.delete("/api/scores/<int:score_id>")
    def delete_score(score_id):
        score = db.session.get(Score, score_id) or abort(404)
        file_path = os.path.join(STORAGE_DIR, score.filename)
        if os.path.exists(file_path):
            os.remove(file_path)
        db.session.delete(score)
        db.session.commit()
        return "", 204

    @app.get("/api/scores/<int:score_id>/file")
    def get_score_file(score_id):
        score = db.session.get(Score, score_id) or abort(404)
        return send_from_directory(
            STORAGE_DIR, score.filename, mimetype="application/pdf"
        )

    # ---------------------------------------------------------- annotations
    @app.get("/api/scores/<int:score_id>/annotations")
    def list_annotations(score_id):
        db.session.get(Score, score_id) or abort(404)
        rows = PageAnnotation.query.filter_by(score_id=score_id).all()
        return jsonify([r.to_dict() for r in rows])

    @app.put("/api/scores/<int:score_id>/annotations/<int:page_number>")
    def upsert_annotation(score_id, page_number):
        db.session.get(Score, score_id) or abort(404)
        payload = request.get_json(silent=True) or {}
        strokes = payload.get("strokes")
        if strokes is None:
            return jsonify({"error": "Body must include a 'strokes' array"}), 400

        row = PageAnnotation.query.filter_by(
            score_id=score_id, page_number=page_number
        ).first()
        if row is None:
            row = PageAnnotation(
                score_id=score_id, page_number=page_number, data=strokes
            )
            db.session.add(row)
        else:
            row.data = strokes
        db.session.commit()
        return jsonify(row.to_dict())

    @app.delete("/api/scores/<int:score_id>/annotations/<int:page_number>")
    def clear_annotation(score_id, page_number):
        row = PageAnnotation.query.filter_by(
            score_id=score_id, page_number=page_number
        ).first()
        if row:
            db.session.delete(row)
            db.session.commit()
        return "", 204


app = create_app()

if __name__ == "__main__":
    app.run(debug=True, port=5001)
