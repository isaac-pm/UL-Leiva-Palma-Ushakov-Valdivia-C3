from typing import TypeVar, Generic, Any, Optional
from pydantic import BaseModel, Field
from enum import Enum


class ResponseStatus(str, Enum):
    SUCCESS = "success"
    ERROR = "error"


T = TypeVar("T")


class ApiResponse(BaseModel, Generic[T]):
    status: ResponseStatus = Field(description="Response status: success or error")
    msg: str = Field(default="OK", description="Response message")
    data: Optional[T] = Field(default=None, description="Response data payload")
    error_details: Optional[Any] = Field(default=None, description="Structured error details")

    @classmethod
    def success(cls, data: T, msg: str = "OK") -> "ApiResponse[T]":
        return cls(status=ResponseStatus.SUCCESS, msg=msg, data=data)

    @classmethod
    def error(cls, msg: str = "Error", details: Any = None) -> "ApiResponse[None]":
        return cls(status=ResponseStatus.ERROR, msg=msg, data=None, error_details=details)