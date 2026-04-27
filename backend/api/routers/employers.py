from fastapi import APIRouter, Depends, Query, Path
from fastapi.exceptions import HTTPException
from sqlmodel import Session

from core.database import get_db_session
from api.schemas.ApiResponse import ApiResponse
from api.services.employers import EmployerService

router = APIRouter(tags=["Employers"])


@router.get("/employers/count", response_model=ApiResponse)
def api_get_employer_count(
    session: Session = Depends(get_db_session)
):
    result = EmployerService.get_count(session)

    if not result.is_success:
        raise HTTPException(
            status_code=result.status_code,
            detail=result.error
        )

    return ApiResponse.success(
        data=result.value,
        msg="Employer count retrieved successfully"
    )


@router.get("/employers", response_model=ApiResponse)
def api_list_employers(
    limit: int = Query(20, ge=1, le=100, description="Max results per page"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    session: Session = Depends(get_db_session)
):
    result = EmployerService.list_employers(
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
        msg="Employers retrieved successfully"
    )


@router.get("/employers/{employer_id}", response_model=ApiResponse)
def api_get_employer(
    employer_id: int = Path(..., description="Employer ID"),
    session: Session = Depends(get_db_session)
):
    result = EmployerService.get_by_id(
        session=session,
        employer_id=employer_id
    )

    if not result.is_success:
        raise HTTPException(
            status_code=result.status_code,
            detail=result.error
        )

    return ApiResponse.success(
        data=result.value,
        msg="Employer retrieved successfully"
    )