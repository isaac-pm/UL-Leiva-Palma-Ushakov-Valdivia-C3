from fastapi import APIRouter, Depends, Query, Path
from fastapi.exceptions import HTTPException
from sqlmodel import Session

from core.database import get_db_session
from api.schemas.ApiResponse import ApiResponse
from api.services.social import SocialService

router = APIRouter(tags=["Social"])


@router.get("/social/count", response_model=ApiResponse)
def api_get_social_count(
    participant_id: int = Query(None, description="Filter by participant ID"),
    session: Session = Depends(get_db_session)
):
    result = SocialService.get_count(
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
        msg="Social connection count retrieved successfully"
    )


@router.get("/social", response_model=ApiResponse)
def api_list_social(
    participant_id: int = Query(..., description="Participant ID"),
    limit: int = Query(20, ge=1, le=100, description="Max results per page"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    session: Session = Depends(get_db_session)
):
    result = SocialService.list_by_participant(
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
        msg="Social connections retrieved successfully"
    )


@router.get("/social/{social_id}", response_model=ApiResponse)
def api_get_social(
    social_id: str = Path(..., description="Social connection UUID"),
    session: Session = Depends(get_db_session)
):
    result = SocialService.get_by_id(
        session=session,
        social_id=social_id
    )

    if not result.is_success:
        raise HTTPException(
            status_code=result.status_code,
            detail=result.error
        )

    return ApiResponse.success(
        data=result.value,
        msg="Social connection retrieved successfully"
    )