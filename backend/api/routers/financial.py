from fastapi import APIRouter, Depends, Query, Path
from fastapi.exceptions import HTTPException
from sqlmodel import Session

from core.database import get_db_session
from api.schemas.ApiResponse import ApiResponse
from api.services.financial import FinancialService

router = APIRouter(tags=["Financials"])


@router.get("/financials/count", response_model=ApiResponse)
def api_get_financial_count(
    participant_id: int = Query(None, description="Filter by participant ID"),
    session: Session = Depends(get_db_session)
):
    result = FinancialService.get_count(
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
        msg="Financial count retrieved successfully"
    )


@router.get("/financials", response_model=ApiResponse)
def api_list_financials(
    participant_id: int = Query(..., description="Participant ID"),
    limit: int = Query(20, ge=1, le=100, description="Max results per page"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    session: Session = Depends(get_db_session)
):
    result = FinancialService.list_by_participant(
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
        msg="Financial records retrieved successfully"
    )


@router.get("/financials/{financial_id}", response_model=ApiResponse)
def api_get_financial(
    financial_id: str = Path(..., description="Financial record UUID"),
    session: Session = Depends(get_db_session)
):
    result = FinancialService.get_by_id(
        session=session,
        financial_id=financial_id
    )

    if not result.is_success:
        raise HTTPException(
            status_code=result.status_code,
            detail=result.error
        )

    return ApiResponse.success(
        data=result.value,
        msg="Financial record retrieved successfully"
    )