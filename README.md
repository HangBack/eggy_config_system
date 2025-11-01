# 配表系统

一个完整的Web配表编辑系统，支持Schema定义和数据配置。

## 功能特性

### Schema编辑面板
- ✅ **左右分栏布局**：左侧字段列表，右侧字段编辑器
- ✅ 创建、编辑、删除Schema
- ✅ 支持多种字段类型：
  - **文本 (text)**: 单行文本输入
  - **数字 (number)**: 数字输入
  - **选项 (option)**: 下拉选择框
  - **数据列表 (datalist)**: 带提示的输入框
  - **条目 (entry)**: 可动态增删的列表项，每项包含多个子字段
- ✅ 字段配置：字段名、标签、类型、默认值、必填
- ✅ 紧凑的单行布局，所有字段信息一行显示
- ✅ 条目类型支持子字段定义（支持文本、数字、选项、数据列表）

### 配表编辑面板
- ✅ **左右分栏布局**：左侧数据行列表，右侧数据编辑器
- ✅ 选择Schema进行数据配置
- ✅ **自定义数据行名称**：每个数据行可以设置独立的名称
- ✅ 根据Schema动态生成表单
- ✅ 支持添加、删除数据行
- ✅ 条目类型支持动态增删项
- ✅ 数据自动保存到对应的JSON文件
- ✅ **导出为Lua表** - 一键生成Lua代码，支持两种格式：
  - Table格式：以键值对形式导出（适合ID映射表）
  - Array格式：以数组形式导出（适合顺序列表）

### 后端API
- ✅ Schema API: 处理schema的增删改查
- ✅ Data API: 处理配表数据的增删改查
- ✅ 自动管理文件存储

## 项目结构

```
web/
├── index.html          # 主页面
├── script.js           # 前端脚本
├── style.css           # 样式文件
├── web.py             # Flask后端服务
├── schema/            # Schema定义存储目录
│   └── *.json        # Schema定义文件
├── data/              # 配表数据存储目录
│   └── *.json        # 配表数据文件
└── assets/            # 静态资源
```

## 安装依赖

```bash
pip install flask flask-cors
```

## 启动服务

1. 启动后端服务：
```bash
python web.py
```

服务将在 http://localhost:5000 启动

2. 打开浏览器访问：
```
打开 index.html 文件即可使用
```

## API接口说明

### Schema API (`/api/schema`)

#### 获取Schema列表
```
GET /api/schema?action=list
```

#### 获取单个Schema
```
GET /api/schema?action=get&name=<schema_name>
```

#### 创建Schema
```
POST /api/schema
{
  "action": "create",
  "name": "schema_name",
  "data": {
    "name": "schema_name",
    "description": "描述",
    "fields": [...]
  }
}
```

#### 更新Schema
```
POST /api/schema
{
  "action": "update",
  "name": "schema_name",
  "data": {
    "name": "schema_name",
    "description": "描述",
    "fields": [...]
  }
}
```

#### 删除Schema
```
POST /api/schema
{
  "action": "delete",
  "name": "schema_name"
}
```

### Data API (`/api/data`)

#### 获取配表数据
```
GET /api/data?action=get&name=<schema_name>
```

#### 更新配表数据
```
POST /api/data
{
  "action": "update",
  "name": "schema_name",
  "data": [...]
}
```

## Schema定义示例

```json
{
  "name": "fish_pool",
  "description": "鱼类权重池配置",
  "fields": [
    {
      "name": "pool_name",
      "label": "池子名称",
      "type": "text",
      "required": true,
      "defaultValue": ""
    },
    {
      "name": "fish_entries",
      "label": "鱼类权重列表",
      "type": "entry",
      "subfields": [
        {
          "name": "fish_id",
          "label": "鱼类ID",
          "type": "datalist",
          "options": [
            {"value": "fish1", "label": "鱼类1"}
          ]
        },
        {
          "name": "weight",
          "label": "权重",
          "type": "number",
          "defaultValue": "10"
        }
      ]
    }
  ]
}
```

## 字段类型说明

### 文本 (text)
单行文本输入框

### 数字 (number)
数字输入框，只能输入数字

### 选项 (option)
下拉选择框，需要配置选项列表

### 数据列表 (datalist)
带自动补全的输入框，可配置值和标签对应关系

### 条目 (entry)
可动态增删的列表项，每项包含多个子字段
- 子字段支持：文本、数字、选项、数据列表
- 所有子项使用相同的字段方案
- 适用于配置列表类数据（如权重池、奖励列表等）

## 使用流程

1. **创建Schema**
   - 在"Schema编辑"面板点击"新建Schema"
   - 填写Schema名称和描述
   - 点击"添加字段"按钮，在左侧列表中添加字段
   - 点击左侧字段项，在右侧编辑器中配置字段属性
   - 字段属性在一行紧凑显示：名称、标签、类型、默认值
   - 必填选项和删除按钮在同一行
   - 如果是条目类型，配置子字段
   - 保存Schema

2. **配置数据**
   - 切换到"配表编辑"面板
   - 选择要编辑的Schema
   - 点击"添加行"创建数据行
   - 点击左侧列表选择数据行
   - **在右侧标题栏输入框中修改数据行名称**（用于Lua导出的键名）
   - 在右侧编辑器中填写各字段数据
   - 对于条目类型，可以点击"添加条目"增加子项
   - 点击"保存"按钮保存配表

3. **数据存储**
   - Schema定义存储在 `schema/<schema_name>.json`
   - 配表数据存储在 `data/<schema_name>.json`
   - 所有数据自动持久化

4. **导出Lua代码**
   - 点击"导出为Lua"按钮
   - 选择导出格式（Table或Array）
   - 点击"复制代码"按钮复制到剪贴板
   - 将代码粘贴到Lua文件中使用

## Lua导出功能

系统支持将配表数据导出为Lua代码，方便直接在游戏中使用。

### 导出格式

#### Table格式
适合需要通过键快速查找的场景，如ID映射表：

```lua
---@namespace Tile

---@class (exact) FishPool
---@field pool_name string 池子名称
---@field pool_type string 池子类型
---@field min_level integer 最低等级
---@field fish_entries table[] 鱼类权重列表

---@type table<string, FishPool>
local result = {
    ["FisheggyIsland"] = {
        ["pool_name"] = "FisheggyIsland", -- 池子名称
        ["pool_type"] = "normal", -- 池子类型
        ["min_level"] = 1, -- 最低等级
        ["fish_entries"] = { -- 鱼类权重列表
            { ["fish_id"] = "FishCode.Clownfish", ["weight"] = 50, ["rarity"] = "common" }
        }
    }
}
```

**特点：**
- 使用数据行名称作为键
- 所有字段统一使用 `["xxx"]` 格式
- 自动生成 `@class` 类型定义
- 字段类型自动推断

#### Array格式
适合顺序遍历的场景，如配置列表：

```lua
---@namespace Tile

---@class (exact) FishPool
---@field pool_name string 池子名称
---@field pool_type string 池子类型
---@field min_level integer 最低等级
---@field fish_entries table[] 鱼类权重列表

---@type FishPool[]
local result = {
    {
        ["pool_name"] = "FisheggyIsland", -- 池子名称
        ["pool_type"] = "normal", -- 池子类型
        ["min_level"] = 1, -- 最低等级
        ["fish_entries"] = { -- 鱼类权重列表
            { ["fish_id"] = "FishCode.Clownfish", ["weight"] = 50, ["rarity"] = "common" }
        }
    }
}
```

### 特性

- ✅ 自动生成注释（包括字段标签）
- ✅ 智能识别枚举值（如 `FishCode.Clownfish`）
- ✅ 条目类型格式化为嵌套表
- ✅ 自动处理nil值
- ✅ 一键复制到剪贴板

## 注意事项

- Schema名称不可重复
- Schema名称只能包含字母、数字、下划线和连字符
- 删除Schema会同时删除关联的配表数据
- 条目类型的子字段不支持嵌套条目
- 导出Lua时，带有`.`的字段值会被识别为枚举（如`FishCode.Clownfish`）

## 技术栈

- **前端**: HTML5, CSS3, JavaScript (ES6+)
- **后端**: Python 3, Flask
- **UI**: Font Awesome图标库
- **数据存储**: JSON文件

## 贡献

豆油汉堡
