from fastapi import APIRouter, Depends, Query, Path
from fastapi.exceptions import HTTPException
from sqlmodel import Session
from typing import Optional

from core.database import get_db_session
from api.schemas.ApiResponse import ApiResponse
from api.services.venues import VenueService

router = APIRouter(tags=["Venues"])


@router.get("/venues/count", response_model=ApiResponse)
def api_get_venue_count(
    venue_type: str = Query("pub", description="Venue type: pub, restaurant, or school"),
    session: Session = Depends(get_db_session)
):
    result = VenueService.get_count(
        session=session,
        venue_type=venue_type
    )

    if not result.is_success:
        raise HTTPException(
            status_code=result.status_code,
            detail=result.error
        )

    return ApiResponse.success(
        data=result.value,
        msg="Venue count retrieved successfully"
    )


@router.get("/venues", response_model=ApiResponse)
def api_list_venues(
    venue_type: str = Query("pub", description="Venue type: pub, restaurant, or school"),
    limit: int = Query(20, ge=1, le=100, description="Max results per page"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    session: Session = Depends(get_db_session)
):
    result = VenueService.list_venues(
        session=session,
        venue_type=venue_type,
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
        msg="Venues retrieved successfully"
    )


@router.get("/venues/{venue_id}", response_model=ApiResponse)
def api_get_venue(
    venue_id: int = Path(..., description="Venue ID"),
    venue_type: str = Query("pub", description="Venue type: pub, restaurant, or school"),
    session: Session = Depends(get_db_session)
):
    result = VenueService.get_by_id(
        session=session,
        venue_id=venue_id,
        venue_type=venue_type
    )

    if not result.is_success:
        raise HTTPException(
            status_code=result.status_code,
            detail=result.error
        )

    return ApiResponse.success(
        data=result.value,
        msg="Venue retrieved successfully"
    )