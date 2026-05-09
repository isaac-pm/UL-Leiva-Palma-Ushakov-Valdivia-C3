from fastapi import APIRouter, Depends
from fastapi.exceptions import HTTPException
from sqlmodel import Session

from core.database import get_db_session
from api.schemas.ApiResponse import ApiResponse
from api.services.workforce import WorkforceService

router = APIRouter(tags=["Workforce"])


@router.get("/workforce/monthly", response_model=ApiResponse)
def api_monthly_workforce(session: Session = Depends(get_db_session)):
    result = WorkforceService.get_monthly_workforce(session)
    if not result.is_success:
        raise HTTPException(
            status_code=result.status_code,
            detail=result.error,
        )
    return ApiResponse.success(
        data=result.value,
        msg="Monthly workforce data retrieved",
    )


@router.get("/workforce/aggregate", response_model=ApiResponse)
def api_aggregate_workforce(session: Session = Depends(get_db_session)):
    result = WorkforceService.get_aggregate_workforce(session)
    if not result.is_success:
        raise HTTPException(
            status_code=result.status_code,
            detail=result.error,
        )
    return ApiResponse.success(
        data=result.value,
        msg="Workforce aggregate data retrieved",
    )
