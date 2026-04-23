from typing import Generic, TypeVar, Optional

T = TypeVar('T')
E = TypeVar('E')

class Result(Generic[T, E]):
    """
    Result Pattern
    """
    def __init__(self, is_success: bool, value: Optional[T] = None, error: Optional[E] = None, status_code:int=200):
        self.is_success = is_success
        self.value = value
        self.error = error
        self.status_code = status_code

    @classmethod
    def ok(cls, value: T) -> 'Result[T, E]':
        return cls(is_success=True, value=value, status_code=200)

    @classmethod
    def fail(cls, error: E, status_code:int = 555) -> 'Result[T, E]':
        return cls(is_success=False, error=error, status_code=status_code)