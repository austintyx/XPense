from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Category, Subcategory
from app.schemas import (
    CategoriesOut,
    CategoryCreateIn,
    CategoryOut,
    SubcategoryCreateIn,
    SubcategoryOut,
)
from app.services.categorize import CATEGORIES as BUILTIN_CATEGORIES

router = APIRouter()


@router.get("/categories", response_model=CategoriesOut)
def list_categories(user_id: int, db: Session = Depends(get_db)):
    categories = db.query(Category).filter_by(user_id=user_id).all()
    subcategories = db.query(Subcategory).filter_by(user_id=user_id).all()
    return CategoriesOut(categories=categories, subcategories=subcategories)


@router.post("/categories", response_model=CategoryOut, status_code=201)
def create_category(user_id: int, body: CategoryCreateIn, db: Session = Depends(get_db)):
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Category name cannot be blank")

    if name.lower() in {c.lower() for c in BUILTIN_CATEGORIES}:
        raise HTTPException(status_code=400, detail="A built-in category with this name already exists")

    existing = db.query(Category).filter_by(user_id=user_id).all()
    if name.lower() in {c.name.lower() for c in existing}:
        raise HTTPException(status_code=400, detail="A category with this name already exists")

    category = Category(user_id=user_id, name=name)
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


@router.delete("/categories/{category_id}", status_code=204)
def delete_category(category_id: int, user_id: int, db: Session = Depends(get_db)):
    category = db.query(Category).filter_by(id=category_id, user_id=user_id).one_or_none()
    if category is None:
        raise HTTPException(status_code=404, detail="Category not found")
    db.delete(category)
    db.commit()


@router.post("/categories/{category}/subcategories", response_model=SubcategoryOut, status_code=201)
def create_subcategory(category: str, user_id: int, body: SubcategoryCreateIn, db: Session = Depends(get_db)):
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Subcategory name cannot be blank")

    existing = db.query(Subcategory).filter_by(user_id=user_id, category=category).all()
    if name.lower() in {s.name.lower() for s in existing}:
        raise HTTPException(status_code=400, detail="A subcategory with this name already exists")

    subcategory = Subcategory(user_id=user_id, category=category, name=name)
    db.add(subcategory)
    db.commit()
    db.refresh(subcategory)
    return subcategory


@router.delete("/subcategories/{subcategory_id}", status_code=204)
def delete_subcategory(subcategory_id: int, user_id: int, db: Session = Depends(get_db)):
    subcategory = db.query(Subcategory).filter_by(id=subcategory_id, user_id=user_id).one_or_none()
    if subcategory is None:
        raise HTTPException(status_code=404, detail="Subcategory not found")
    db.delete(subcategory)
    db.commit()
