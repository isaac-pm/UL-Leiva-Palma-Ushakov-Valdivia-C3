from fastapi import APIRouter, Depends, Query, Path
from fastapi.exceptions import HTTPException
from sqlmodel import Session

from core.database import get_db_session
from api.schemas.ApiResponse import ApiResponse
from api.services.checkin import CheckinService

router = APIRouter(tags=["Checkins"])


@router.get("/checkins/count", response_model=ApiResponse)
def api_get_checkin_count(
    participant_id: int = Query(None, description="Filter by participant ID"),
    session: Session = Depends(get_db_session)
):
    result = CheckinService.get_count(
        session=session,
        participant_id=participant_id
    )

    if not result.is_success:
        raise HTTPException(
            status_code=result.status_code,
            detail=result.error
        )

    return ApiResponse.success(
        data=result.value,
        msg="Checkin count retrieved successfully"
    )


@router.get("/checkins", response_model=ApiResponse)
def api_list_checkins(
    participant_id: int = Query(..., description="Participant ID"),
    limit: int = Query(20, ge=1, le=100, description="Max results per page"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    session: Session = Depends(get_db_session)
):
    result = CheckinService.list_by_participant(
        session=session,
        participant_id=participant_id,
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
        msg="Checkins retrieved successfully"
    )


@router.get("/checkins/{checkin_id}", response_model=ApiResponse)
def api_get_checkin(
    checkin_id: str = Path(..., description="Checkin UUID"),
    session: Session = Depends(get_db_session)
):
    result = CheckinService.get_by_id(
        session=session,
        checkin_id=checkin_id
    )

    if not result.is_success:
        raise HTTPException(
            status_code=result.status_code,
            detail=result.error
        )

    return ApiResponse.success(
        data=result.value,
        msg="Checkin retrieved successfully"
    )