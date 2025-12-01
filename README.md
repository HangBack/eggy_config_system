# Eggy Config System

游戏配置表管理工具，支持 Schema 定义、枚举管理、数据编辑，导出 Lua。

## 快速开始

```bash
pip install flask
python web.py
# 访问 http://localhost:5000
```

开发模式（自动重载）:
```bash
python dev.py
```

## 项目结构

```
projects/
  default/           # 默认项目
    schema/          # 表结构定义
    enum/            # 枚举定义
    data/            # 数据文件
```

## 字段类型

| 类型 | 说明 | 示例 |
|------|------|------|
| `number` | 数值 | `{"type": "number", "default": 0}` |
| `text` | 文本 | `{"type": "text"}` |
| `text-raw` | 原始文本（导出时保留引号） | `{"type": "text-raw"}` |
| `richtext` | 富文本（Markdown语法） | `{"type": "richtext"}` |
| `boolean` | 布尔值 | `{"type": "boolean", "default": false}` |
| `color` | 颜色选择器 | `{"type": "color", "default": "#FFFFFF"}` |
| `option` | 下拉选择（枚举或手动） | 见下方 |
| `flags` | 多选标记 | `{"type": "flags", "enum": "ItemTag"}` |
| `list` | 列表 | `{"type": "list", "itemType": "number"}` |
| `entry` | 子表/对象 | `{"type": "entry", "fields": [...]}` |
| `datalist` | 数据引用 | `{"type": "datalist", "source": "Skill"}` |

### option 类型

引用枚举:
```json
{"type": "option", "enum": "ItemType"}
```

手动定义:
```json
{"type": "option", "options": [
  {"label": "简单", "value": 1},
  {"label": "困难", "value": 2}
]}
```

## 富文本语法

编辑器使用 Markdown 语法，自动转换为游戏内格式:

```
# 一级标题     -> #f(h1)内容#l
**加粗**       -> #f(b)内容#l
__下划线__     -> #f(u)内容#l
~~删除线~~     -> #f(s)内容#l
{c:red}红色{/c}  -> #f(c:red)内容#l
```

## Schema 示例

```json
{
  "id": {"label": "ID", "type": "number", "primary": true},
  "name": {"label": "名称", "type": "text"},
  "type": {"label": "类型", "type": "option", "enum": "ItemType"},
  "stats": {
    "label": "属性",
    "type": "entry",
    "fields": {
      "atk": {"label": "攻击", "type": "number"},
      "def": {"label": "防御", "type": "number"}
    }
  }
}
```

## 枚举定义

```json
{
  "name": "ItemType",
  "description": "物品类型",
  "values": {
    "Weapon": 1,
    "Armor": 2,
    "Consumable": 3
  }
}
```

flags 枚举使用位索引:
```json
{
  "name": "ItemTag",
  "description": "物品标签",
  "isFlags": true,
  "values": {
    "Tradable": 0,
    "Stackable": 1,
    "Rare": 2
  }
}
```

## 导出

点击「导出 Lua」按钮，生成格式:

```lua
return {
  [1] = {id = 1, name = "长剑", type = 1},
  [2] = {id = 2, name = "木盾", type = 2},
}
```

## License

MIT
