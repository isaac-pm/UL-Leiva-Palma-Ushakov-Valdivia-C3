from fastapi import APIRouter, Depends, Query
from fastapi.exceptions import HTTPException
from sqlmodel import Session

from core.database import get_db_session
from api.schemas.ApiResponse import ApiResponse
from api.services.activity import ActivityService

router = APIRouter(tags=["Activity"])


@router.get("/activity/count", response_model=ApiResponse)
def api_get_activity_count(
    session: Session = Depends(get_db_session)
):
    result = ActivityService.get_count(session)

    if not result.is_success:
        raise HTTPException(
            status_code=result.status_code,
            detail=result.error
        )

    return ApiResponse.success(
        data=result.value,
        msg="Activity log count retrieved successfully"
    )


@router.get("/activity/modes", response_model=ApiResponse)
def api_get_mode_distribution(
    session: Session = Depends(get_db_session)
):
    result = ActivityService.get_mode_distribution(session)

    if not result.is_success:
        raise HTTPException(
            status_code=result.status_code,
            detail=result.error
        )

    return ApiResponse.success(
        data=result.value,
        msg="Activity mode distribution retrieved successfully"
    )


@router.get("/activity/volume", response_model=ApiResponse)
def api_get_hourly_volume(
    days: int = Query(7, ge=1, le=90, description="Number of days to look back"),
    session: Session = Depends(get_db_session)
):
    result = ActivityService.get_hourly_volume(
        session=session,
        days=days
    )

    if not result.is_success:
        raise HTTPException(
            status_code=result.status_code,
            detail=result.error
        )

    return ApiResponse.success(
        data=result.value,
        msg="Activity hourly volume retrieved successfully"
    )


@router.get("/activity/locations", response_model=ApiResponse)
def api_get_location_counts(
    limit: int = Query(20, ge=1, le=100, description="Max results"),
    session: Session = Depends(get_db_session)
):
    result = ActivityService.get_location_counts(
        session=session,
        limit=limit
    )

    if not result.is_success:
        raise HTTPException(
            status_code=result.status_code,
            detail=result.error
        )

    return ApiResponse.success(
        data=result.value,
        msg="Activity location counts retrieved successfully"
    )