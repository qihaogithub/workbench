export default {
  $preview: { width: 375, height: 812 },

  "基础信息": {
    title: { type: "string", title: "活动标题", default: "夏日清凉大促" },
    price: { type: "number", title: "优惠价格", default: 29.9 },
    stock: { type: "integer", title: "库存数量", default: 99 },
    enabled: { type: "boolean", title: "是否开启", default: true },
  },

  "详细描述": {
    desc: {
      type: "text",
      title: "活动描述",
      default: "炎炎夏日，全场冰饮 5 折起，会员再享满减。清凉一夏，好礼不断，快来参与吧！",
    },
  },
};
