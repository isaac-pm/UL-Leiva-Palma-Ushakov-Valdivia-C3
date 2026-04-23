from fastapi import APIRouter, Depends, Query, Path
from fastapi.exceptions import HTTPException
from sqlmodel import Session

from core.database import get_db_session
from api.schemas.ApiResponse import ApiResponse
from api.services.travel import TravelService

router = APIRouter(tags=["Travel"])


@router.get("/travels/count", response_model=ApiResponse)
def api_get_travel_count(
    participant_id: int = Query(None, description="Filter by participant ID"),
    session: Session = Depends(get_db_session)
):
    result = TravelService.get_count(
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
        msg="Travel count retrieved successfully"
    )


@router.get("/travels", response_model=ApiResponse)
def api_list_travels(
    participant_id: int = Query(..., description="Participant ID"),
    limit: int = Query(20, ge=1, le=100, description="Max results per page"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    session: Session = Depends(get_db_session)
):
    result = TravelService.list_by_participant(
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
        msg="Travel records retrieved successfully"
    )


@router.get("/travels/{travel_id}", response_model=ApiResponse)
def api_get_travel(
    travel_id: str = Path(..., description="Travel record UUID"),
    session: Session = Depends(get_db_session)
):
    result = TravelService.get_by_id(
        session=session,
        travel_id=travel_id
    )

    if not result.is_success:
        raise HTTPException(
            status_code=result.status_code,
            detail=result.error
        )

    return ApiResponse.success(
        data=result.value,
        msg="Travel record retrieved successfully"
    )