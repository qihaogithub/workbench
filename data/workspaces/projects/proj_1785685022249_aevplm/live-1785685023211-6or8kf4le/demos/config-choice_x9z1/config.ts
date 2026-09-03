export default {
  $preview: { width: 375, height: 812 },

  "单选风格": {
    style: {
      type: "enum",
      title: "视觉风格",
      enum: ["minimal", "festival", "luxury"],
      enumNames: ["极简", "节日", "奢华"],
      default: "festival",
    },
  },

  "多选标签": {
    tags: {
      type: "enum",
      title: "活动标签",
      enum: ["discount", "new", "hot", "limited"],
      enumNames: ["折扣", "新品", "热门", "限量"],
      multiple: true,
      default: ["discount", "hot"],
    },
  },

  "投放地区": {
    region: {
      type: "cascade",
      title: "投放地区",
      default: ["zhejiang", "hangzhou"],
      options: [
        {
          value: "beijing",
          label: "北京",
          children: [
            { value: "chaoyang", label: "朝阳" },
            { value: "haidian", label: "海淀" },
          ],
        },
        {
          value: "zhejiang",
          label: "浙江",
          children: [
            { value: "hangzhou", label: "杭州" },
            { value: "ningbo", label: "宁波" },
          ],
        },
        {
          value: "guangdong",
          label: "广东",
          children: [
            { value: "guangzhou", label: "广州" },
            { value: "shenzhen", label: "深圳" },
          ],
        },
      ],
    },
  },
};
