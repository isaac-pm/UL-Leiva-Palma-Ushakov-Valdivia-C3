from fastapi import APIRouter, Depends, Query, Path
from fastapi.exceptions import HTTPException
from sqlmodel import Session
from typing import Optional

from core.database import get_db_session
from core.result import Result as ServiceResult
from api.schemas.ApiResponse import ApiResponse
from api.services.participants import ParticipantService

router = APIRouter(tags=["Participants"])


@router.get("/participants/count", response_model=ApiResponse)
def api_get_participant_count(
    session: Session = Depends(get_db_session)
):
    result = ParticipantService.get_count(session)

    if not result.is_success:
        raise HTTPException(
            status_code=result.status_code,
            detail=result.error
        )

    return ApiResponse.success(
        data=result.value,
        msg="Participant count retrieved successfully"
    )


@router.get("/participants", response_model=ApiResponse)
def api_list_participants(
    limit: int = Query(20, ge=1, le=100, description="Max results per page"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    session: Session = Depends(get_db_session)
):
    result = ParticipantService.list_participants(
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
        msg="Participants retrieved successfully"
    )


@router.get("/participants/{participant_id}", response_model=ApiResponse)
def api_get_participant(
    participant_id: int = Path(..., description="Participant ID"),
    session: Session = Depends(get_db_session)
):
    result = ParticipantService.get_by_id(
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
        msg="Participant retrieved successfully"
    )