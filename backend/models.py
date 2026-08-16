"""SQLAlchemy models for Segno.

A Score is one uploaded PDF (a piece of sheet music). Each Score has many
PageAnnotation rows -- one per PDF page that has ink on it. We only create
a PageAnnotation row the first time a page is drawn on, so an untouched
150-page score costs almost nothing to store.
"""
from datetime import datetime, timezone

from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


def utcnow():
    return datetime.now(timezone.utc)


class Score(db.Model):
    __tablename__ = "scores"

    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(255), nullable=False)
    composer = db.Column(db.String(255), nullable=True)
    filename = db.Column(db.String(255), nullable=False)  # name on disk in storage/
    original_filename = db.Column(db.String(255), nullable=False)
    page_count = db.Column(db.Integer, nullable=False, default=0)
    last_opened_page = db.Column(db.Integer, nullable=False, default=1)
    created_at = db.Column(db.DateTime, default=utcnow)
    updated_at = db.Column(db.DateTime, default=utcnow, onupdate=utcnow)

    annotations = db.relationship(
        "PageAnnotation",
        backref="score",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    def to_dict(self):
        return {
            "id": self.id,
            "title": self.title,
            "composer": self.composer,
            "originalFilename": self.original_filename,
            "pageCount": self.page_count,
            "lastOpenedPage": self.last_opened_page,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
            "updatedAt": self.updated_at.isoformat() if self.updated_at else None,
        }


class PageAnnotation(db.Model):
    __tablename__ = "page_annotations"
    __table_args__ = (
        db.UniqueConstraint("score_id", "page_number", name="uq_score_page"),
    )

    id = db.Column(db.Integer, primary_key=True)
    score_id = db.Column(db.Integer, db.ForeignKey("scores.id"), nullable=False)
    page_number = db.Column(db.Integer, nullable=False)  # 1-indexed
    # Raw JSON blob describing every stroke/highlight on this page.
    # Shape is owned by the frontend -- see frontend/src/types/index.ts (Stroke[]).
    data = db.Column(db.JSON, nullable=False, default=list)
    updated_at = db.Column(db.DateTime, default=utcnow, onupdate=utcnow)

    def to_dict(self):
        return {
            "pageNumber": self.page_number,
            "strokes": self.data or [],
            "updatedAt": self.updated_at.isoformat() if self.updated_at else None,
        }
