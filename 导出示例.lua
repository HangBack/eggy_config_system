---@namespace Tile

-- 鱼类权重池配置

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
            { ["fish_id"] = "FishCode.Clownfish", ["weight"] = 50, ["rarity"] = "common" },
            { ["fish_id"] = "FishCode.SeaBream", ["weight"] = 35, ["rarity"] = "common" },
            { ["fish_id"] = "FishCode.BullShark", ["weight"] = 10, ["rarity"] = "uncommon" },
            { ["fish_id"] = "FishCode.Bannerfish", ["weight"] = 50, ["rarity"] = "common" },
            { ["fish_id"] = "FishCode.Moonfish", ["weight"] = 1, ["rarity"] = "legendary" }
        }
    },
    ["IceMountainIsland"] = {
        ["pool_name"] = "IceMountainIsland", -- 池子名称
        ["pool_type"] = "special", -- 池子类型
        ["min_level"] = 5, -- 最低等级
        ["fish_entries"] = { -- 鱼类权重列表
            { ["fish_id"] = "FishCode.AmericanLobster", ["weight"] = 15, ["rarity"] = "uncommon" },
            { ["fish_id"] = "FishCode.Salmon", ["weight"] = 15, ["rarity"] = "common" },
            { ["fish_id"] = "FishCode.KillerWhale", ["weight"] = 1, ["rarity"] = "legendary" }
        }
    },
    ["Ocean"] = {
        ["pool_name"] = "Ocean", -- 池子名称
        ["pool_type"] = "rare", -- 池子类型
        ["min_level"] = 10, -- 最低等级
        ["fish_entries"] = { -- 鱼类权重列表
            { ["fish_id"] = "FishCode.GreatWhiteShark", ["weight"] = 1, ["rarity"] = "legendary" },
            { ["fish_id"] = "FishCode.Sailfish", ["weight"] = 30, ["rarity"] = "rare" },
            { ["fish_id"] = "FishCode.Tuna", ["weight"] = 20, ["rarity"] = "uncommon" }
        }
    }
}

return result
