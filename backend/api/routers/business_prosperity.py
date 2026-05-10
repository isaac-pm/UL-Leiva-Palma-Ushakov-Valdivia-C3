from fastapi import APIRouter, Depends, Path
from fastapi.exceptions import HTTPException
from sqlmodel import Session

from api.schemas.ApiResponse import ApiResponse
from api.services.business_prosperity import BusinessProsperityService
from core.database import get_db_session

router = APIRouter(tags=["Business Prosperity"])


@router.get("/business-prosperity/summary", response_model=ApiResponse)
def api_get_business_prosperity_summary(
    session: Session = Depends(get_db_session),
):
    result = BusinessProsperityService.get_summary(session)

    if not result.is_success:
        raise HTTPException(
            status_code=result.status_code,
            detail=result.error,
        )

    return ApiResponse.success(
        data=result.value,
        msg="Business prosperity summary retrieved successfully",
    )


@router.get("/business-prosperity/{business_type}/{business_id}/timeseries", response_model=ApiResponse)
def api_get_business_prosperity_timeseries(
    business_type: str = Path(..., description="Business type: Restaurant or Pub"),
    business_id: int = Path(..., description="Business ID"),
    session: Session = Depends(get_db_session),
):
    result = BusinessProsperityService.get_timeseries(
        session=session,
        business_type=business_type,
        business_id=business_id,
    )

    if not result.is_success:
        raise HTTPException(
            status_code=result.status_code,
            detail=result.error,
        )

    return ApiResponse.success(
        data=result.value,
        msg="Business prosperity timeseries retrieved successfully",
    )
