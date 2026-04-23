from fastapi import APIRouter, Depends, Query, Path
from fastapi.exceptions import HTTPException
from sqlmodel import Session

from core.database import get_db_session
from api.schemas.ApiResponse import ApiResponse
from api.services.jobs import JobService

router = APIRouter(tags=["Jobs"])


@router.get("/jobs/count", response_model=ApiResponse)
def api_get_job_count(
    session: Session = Depends(get_db_session)
):
    result = JobService.get_count(session)

    if not result.is_success:
        raise HTTPException(
            status_code=result.status_code,
            detail=result.error
        )

    return ApiResponse.success(
        data=result.value,
        msg="Job count retrieved successfully"
    )


@router.get("/jobs", response_model=ApiResponse)
def api_list_jobs(
    limit: int = Query(20, ge=1, le=100, description="Max results per page"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    session: Session = Depends(get_db_session)
):
    result = JobService.list_jobs(
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
        msg="Jobs retrieved successfully"
    )


@router.get("/jobs/{job_id}", response_model=ApiResponse)
def api_get_job(
    job_id: int = Path(..., description="Job ID"),
    session: Session = Depends(get_db_session)
):
    result = JobService.get_by_id(
        session=session,
        job_id=job_id
    )

    if not result.is_success:
        raise HTTPException(
            status_code=result.status_code,
            detail=result.error
        )

    return ApiResponse.success(
        data=result.value,
        msg="Job retrieved successfully"
    )