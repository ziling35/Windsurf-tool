# 服务器端Bug修复说明

## 问题描述
服务器在处理 HTTPException 时没有正确返回状态码，导致所有的HTTP异常（如401）都被转换成了500错误。

## 错误位置
文件: `/app/app/main.py`
函数: `custom_http_exception_handler`
行号: 35

## 当前错误代码
```python
@app.exception_handler(HTTPException)
async def custom_http_exception_handler(request: Request, exc: HTTPException):
    raise exc  # ❌ 错误：重新抛出异常导致返回500
```

## 修复方案

### 方案1：正确返回HTTP异常（推荐）
```python
from fastapi.responses import JSONResponse

@app.exception_handler(HTTPException)
async def custom_http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail}
    )
```

### 方案2：如果不需要自定义处理，删除这个handler
```python
# 直接删除或注释掉这个异常处理器
# @app.exception_handler(HTTPException)
# async def custom_http_exception_handler(request: Request, exc: HTTPException):
#     raise exc
```

## 测试验证

修复后，使用无效密钥请求应该返回：
```
HTTP/1.1 401 Unauthorized
Content-Type: application/json

{
  "detail": "无效的API密钥"
}
```

而不是：
```
HTTP/1.1 500 Internal Server Error
Content-Type: text/plain

Internal Server Error
```

## 影响范围
此bug影响所有使用 HTTPException 的接口，包括：
- 密钥验证 (401)
- 权限检查 (403)
- 资源不存在 (404)
- 频率限制 (429)
等等

修复后客户端将能够正确识别和处理这些错误。
