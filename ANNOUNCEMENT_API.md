# 公告功能 - 后端API文档

## 概述

客户端已添加公告显示功能，需要后端提供相应的API接口和管理界面。

## 前端已完成的工作

### 1. 界面展示
- ✅ 在主页顶部添加了醒目的公告卡片
- ✅ 渐变紫色背景，带有图案装饰
- ✅ 支持多行文本显示
- ✅ 显示发布时间
- ✅ 可关闭按钮

### 2. 功能实现
- ✅ 启动时自动获取公告
- ✅ 如果没有公告或获取失败，自动隐藏公告区域
- ✅ 支持关闭公告
- ✅ 完整的错误处理

### 3. 接口调用
- 客户端会调用: `GET /api/client/announcement`
- 无需认证（公开接口）
- 超时时间: 10秒

## 后端需要实现的功能

### 1. API 接口

#### 获取公告接口

**接口地址**: `GET /api/client/announcement`

**请求参数**: 无

**响应格式**:

```json
{
  "content": "欢迎使用 PaperCrane-Windsurf！\n\n最新更新：\n- 新增公告功能\n- 优化账号切换速度\n- 修复已知问题\n\n如有问题请联系管理员。",
  "created_at": "2025-12-08T00:00:00Z",
  "updated_at": "2025-12-08T12:00:00Z"
}
```

**字段说明**:
- `content` (string, 必需): 公告内容，支持换行符 `\n`
- `created_at` (string, 可选): 创建时间，ISO 8601 格式
- `updated_at` (string, 可选): 更新时间，ISO 8601 格式

**特殊情况**:
- 如果没有公告，返回空内容: `{"content": ""}`
- 如果接口不存在，客户端会自动隐藏公告区域

**错误响应**:
```json
{
  "detail": "错误信息"
}
```

### 2. 数据库设计

建议的数据表结构:

```sql
CREATE TABLE announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**字段说明**:
- `id`: 主键
- `content`: 公告内容
- `is_active`: 是否启用（只返回启用的公告）
- `created_at`: 创建时间
- `updated_at`: 更新时间

### 3. 管理后台功能

需要在管理后台添加以下功能:

#### 3.1 公告列表页面
- 显示所有公告
- 显示状态（启用/禁用）
- 显示创建时间和更新时间
- 操作按钮：编辑、删除、启用/禁用

#### 3.2 创建/编辑公告页面
- 公告内容输入框（支持多行）
- 启用/禁用开关
- 实时预览（可选）
- 保存按钮

#### 3.3 业务逻辑
- 同时只能有一条启用的公告
- 创建新公告时，自动禁用其他公告
- 支持软删除或硬删除
- 记录操作日志（可选）

## 实现示例

### Python (FastAPI) 示例

```python
from fastapi import APIRouter, HTTPException
from datetime import datetime
from typing import Optional
from pydantic import BaseModel

router = APIRouter()

class AnnouncementResponse(BaseModel):
    content: str
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

@router.get("/api/client/announcement", response_model=AnnouncementResponse)
async def get_announcement():
    """
    获取当前启用的公告
    """
    try:
        # 从数据库获取启用的公告
        announcement = db.query(Announcement).filter(
            Announcement.is_active == True
        ).first()
        
        if not announcement:
            # 没有公告时返回空内容
            return AnnouncementResponse(content="")
        
        return AnnouncementResponse(
            content=announcement.content,
            created_at=announcement.created_at.isoformat() if announcement.created_at else None,
            updated_at=announcement.updated_at.isoformat() if announcement.updated_at else None
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

### 管理接口示例

```python
from fastapi import APIRouter, Depends
from typing import List

admin_router = APIRouter()

class AnnouncementCreate(BaseModel):
    content: str
    is_active: bool = True

class AnnouncementUpdate(BaseModel):
    content: Optional[str] = None
    is_active: Optional[bool] = None

@admin_router.post("/api/admin/announcements")
async def create_announcement(
    data: AnnouncementCreate,
    current_user: User = Depends(get_current_admin_user)
):
    """
    创建新公告
    """
    # 如果新公告是启用状态，禁用其他公告
    if data.is_active:
        db.query(Announcement).update({"is_active": False})
    
    announcement = Announcement(
        content=data.content,
        is_active=data.is_active
    )
    db.add(announcement)
    db.commit()
    
    return {"success": True, "message": "公告创建成功"}

@admin_router.get("/api/admin/announcements")
async def list_announcements(
    current_user: User = Depends(get_current_admin_user)
):
    """
    获取所有公告列表
    """
    announcements = db.query(Announcement).order_by(
        Announcement.created_at.desc()
    ).all()
    
    return {"success": True, "data": announcements}

@admin_router.put("/api/admin/announcements/{announcement_id}")
async def update_announcement(
    announcement_id: int,
    data: AnnouncementUpdate,
    current_user: User = Depends(get_current_admin_user)
):
    """
    更新公告
    """
    announcement = db.query(Announcement).filter(
        Announcement.id == announcement_id
    ).first()
    
    if not announcement:
        raise HTTPException(status_code=404, detail="公告不存在")
    
    # 如果要启用此公告，禁用其他公告
    if data.is_active:
        db.query(Announcement).filter(
            Announcement.id != announcement_id
        ).update({"is_active": False})
    
    if data.content is not None:
        announcement.content = data.content
    if data.is_active is not None:
        announcement.is_active = data.is_active
    
    announcement.updated_at = datetime.now()
    db.commit()
    
    return {"success": True, "message": "公告更新成功"}

@admin_router.delete("/api/admin/announcements/{announcement_id}")
async def delete_announcement(
    announcement_id: int,
    current_user: User = Depends(get_current_admin_user)
):
    """
    删除公告
    """
    announcement = db.query(Announcement).filter(
        Announcement.id == announcement_id
    ).first()
    
    if not announcement:
        raise HTTPException(status_code=404, detail="公告不存在")
    
    db.delete(announcement)
    db.commit()
    
    return {"success": True, "message": "公告删除成功"}
```

## 前端显示效果

公告会显示在主页顶部，样式如下:

```
┌─────────────────────────────────────────────────────┐
│ 📢 系统公告                                    ✕    │
│                                                     │
│ 欢迎使用 PaperCrane-Windsurf！                      │
│                                                     │
│ 最新更新：                                          │
│ - 新增公告功能                                      │
│ - 优化账号切换速度                                  │
│ - 修复已知问题                                      │
│                                                     │
│ 如有问题请联系管理员。                              │
│ ─────────────────────────────────────────────────  │
│ 发布时间: 2025-12-08 12:00                         │
└─────────────────────────────────────────────────────┘
```

## 测试方法

### 1. 测试接口是否正常
```bash
curl http://your-server:8000/api/client/announcement
```

### 2. 测试客户端显示
- 启动客户端
- 查看主页是否显示公告
- 点击关闭按钮测试

### 3. 测试边界情况
- 没有公告时，客户端应自动隐藏公告区域
- 接口返回错误时，客户端应自动隐藏公告区域
- 公告内容包含换行符时，应正确显示

## 注意事项

1. **性能优化**: 公告接口会被频繁调用，建议添加缓存
2. **内容长度**: 建议限制公告内容长度（如 500 字符）
3. **XSS防护**: 后端应对公告内容进行 HTML 转义
4. **权限控制**: 管理接口需要管理员权限
5. **日志记录**: 建议记录公告的创建、修改、删除操作

## 后续优化建议

1. **富文本支持**: 支持 Markdown 格式
2. **多语言支持**: 根据客户端语言返回不同公告
3. **定时发布**: 支持设置公告的生效时间和过期时间
4. **优先级**: 支持多条公告，按优先级显示
5. **统计功能**: 记录公告的查看次数和关闭次数
