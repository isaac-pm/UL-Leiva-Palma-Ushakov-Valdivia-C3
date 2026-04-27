from fastapi import APIRouter, Depends, Query, Path
from fastapi.exceptions import HTTPException
from sqlmodel import Session

from core.database import get_db_session
from api.schemas.ApiResponse import ApiResponse
from api.services.apartments import ApartmentService

router = APIRouter(tags=["Apartments"])


@router.get("/apartments/count", response_model=ApiResponse)
def api_get_apartment_count(
    session: Session = Depends(get_db_session)
):
    result = ApartmentService.get_count(session)

    if not result.is_success:
        raise HTTPException(
            status_code=result.status_code,
            detail=result.error
        )

    return ApiResponse.success(
        data=result.value,
        msg="Apartment count retrieved successfully"
    )


@router.get("/apartments", response_model=ApiResponse)
def api_list_apartments(
    limit: int = Query(20, ge=1, le=100, description="Max results per page"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    session: Session = Depends(get_db_session)
):
    result = ApartmentService.list_apartments(
        session=session,
        limit=limit,
        offset=offset
    )

    if not result.is_success:
        raise HTTPException(
            status_code=result.status_code,
            detail=result.error
        )

    return ApiResponse.success(
        data=result.value,
        msg="Apartments retrieved successfully"
    )


@router.get("/apartments/{apartment_id}", response_model=ApiResponse)
def api_get_apartment(
    apartment_id: int = Path(..., description="Apartment ID"),
    session: Session = Depends(get_db_session)
):
    result = ApartmentService.get_by_id(
        session=session,
        apartment_id=apartment_id
    )

    if not result.is_success:
        raise HTTPException(
            status_code=result.status_code,
            detail=result.error
        )

    return ApiResponse.success(
        data=result.value,
        msg="Apartment retrieved successfully"
    )