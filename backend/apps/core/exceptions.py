from rest_framework.views import exception_handler as drf_handler


def exception_handler(exc, context):
    """Normalise errors to {"detail": str, "errors": {...}} for the frontend."""
    response = drf_handler(exc, context)
    if response is None:
        return None
    data = response.data
    if isinstance(data, dict) and "detail" in data:
        return response
    detail = "اطلاعات ارسالی معتبر نیست."
    if isinstance(data, list) and data:
        detail = str(data[0])
    elif isinstance(data, dict):
        for value in data.values():
            if isinstance(value, list) and value:
                detail = str(value[0])
                break
            if isinstance(value, str):
                detail = value
                break
    response.data = {"detail": detail, "errors": data}
    return response
