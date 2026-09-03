interface DemoProps {}

export default function Demo(_props: DemoProps) {
  return (
    <div className="w-[375px] min-h-screen bg-[#FFEAA3] mx-auto relative overflow-hidden">
      {/* Navigation Bar */}
      <div className="sticky top-0 z-10">
        <div className="w-[375px] h-[44px] bg-[#08ADFF] relative">
          <img
            src="https://img.onlywnn.cn/figma/h_37173ecb.svg"
            alt="status"
            className="absolute right-[14.33px] top-[17.33px] w-[67px] h-[11px]"
          />
          <img
            src="https://img.onlywnn.cn/figma/h_ce0aae82.svg"
            alt="time"
            className="absolute left-[20.6px] top-[16.81px] w-[24px] h-[10px]"
          />
        </div>
        <div className="w-[375px] h-[44px] bg-[#08ADFF] flex items-center justify-between relative">
          <div className="w-[44px] h-[44px] flex items-center justify-center">
            <img
              src="https://img.onlywnn.cn/figma/h_3d2ee63f.svg"
              alt="back"
              className="w-[10px] h-[18px]"
            />
          </div>
          <div className="absolute left-[51px] top-[9.5px] w-[272px] text-center text-white text-[18px] font-medium leading-[27px]">
            闯关活动
          </div>
          <div className="w-[44px] h-[44px] flex items-center justify-center">
            <img
              src="https://img.onlywnn.cn/figma/h_8cacd813.svg"
              alt="more"
              className="w-[18px] h-[18px]"
            />
          </div>
        </div>
      </div>

      {/* Hero Section */}
      <div className="relative w-[375px] h-[286px] overflow-hidden">
        <img
          src="/api/images/img_OgNdfZ5rx-OJNQ"
          alt="hero"
          className="w-[375px] h-[286px] object-cover absolute top-0 left-0"
        />

        {/* Rule button */}
        <div className="absolute top-[143px] right-0 w-[57px] h-[25px] bg-black/30 rounded-l-[14px] flex items-center justify-center gap-[10px] px-[5px] pl-[10px]">
          <span className="text-white text-[14px] font-[FZLanTingYuan-B-GBK] tracking-[3.36px]">
            规则
          </span>
        </div>

        {/* Music button */}
        <div className="absolute top-[104.99px] right-[12px] w-[30px] h-[30px]">
          <div className="w-[24px] h-[24px] rounded-full border-2 border-white shadow-[0_1px_1px_rgba(0,0,0,0.1)] absolute top-[3px] left-[3px]" />
        </div>

        {/* "叫叫明星赛" logo */}
        <div className="absolute top-[11px] left-[4px] w-[94px] h-[24px]">
          <img
            src="https://img.onlywnn.cn/figma/h_5c9be782.svg"
            alt="deco"
            className="absolute left-[12.77px] top-[6.32px] w-[5px] h-[12px]"
          />
          <img
            src="https://img.onlywnn.cn/figma/h_5c9be782.svg"
            alt="deco"
            className="absolute left-[27.34px] top-[6.32px] w-[5px] h-[12px]"
          />
          <img
            src="https://img.onlywnn.cn/figma/h_74a7e013.svg"
            alt="deco"
            className="absolute left-[16.84px] top-[6.31px] w-[2px] h-[15px]"
          />
          <img
            src="https://img.onlywnn.cn/figma/h_74a7e013.svg"
            alt="deco"
            className="absolute left-[31.41px] top-[6.31px] w-[2px] h-[15px]"
          />
        </div>
      </div>

      {/* Participant Count Bar */}
      <div className="relative w-[375px] h-[45px]">
        <img
          src="/api/images/img_r2ifXUODrxrThg"
          alt="participant-bar"
          className="w-[375px] h-[45px] object-cover absolute top-0 left-0"
        />
        <img
          src="/api/images/img_BY1IMzQ3Cm-L1Q"
          alt="participant-count"
          className="w-[165px] h-[30px] absolute top-[7px] left-[105px]"
        />
      </div>

      {/* Level Section */}
      <div className="relative w-[375px] h-[656px] overflow-hidden">
        <img
          src="/api/images/img_kLxZeqfJjszDiA"
          alt="level-bg"
          className="w-[375px] h-[656px] object-cover absolute top-0 left-0"
        />
        {/* Level 1 - Active */}
        <img
          src="/api/images/img_mfLUQLiSRORQYg"
          alt="level-1"
          className="w-[165px] h-[184px] object-cover absolute top-[1px] left-[14px]"
        />
        {/* Level 2 - Locked */}
        <img
          src="/api/images/img_4NHsdlWk2wLGFA"
          alt="level-2"
          className="w-[165px] h-[184px] object-cover absolute top-[147px] left-[196px]"
        />
        {/* Level 3 - Locked */}
        <img
          src="/api/images/img_Rez-6_dmtwwmug"
          alt="level-3"
          className="w-[171px] h-[195px] object-cover absolute top-[316px] left-[40px]"
        />
      </div>

      {/* Bottom Content Sections */}
      <div className="w-[375px]">
        {/* Image banners */}
        <img
          src="https://img.onlywnn.cn/figma/h_3cf708c2.png"
          alt="banner"
          className="w-[375px] h-[346px] object-cover"
        />
        <img
          src="https://img.onlywnn.cn/figma/h_8441b726.png"
          alt="banner"
          className="w-[375px] h-[97px] object-cover"
        />
        <img
          src="https://img.onlywnn.cn/figma/h_c4354908.png"
          alt="banner"
          className="w-[375px] h-[244px] object-cover"
        />
        <img
          src="https://img.onlywnn.cn/figma/h_38bff241.png"
          alt="banner"
          className="w-[375px] h-[110px] object-cover"
        />
        <img
          src="https://img.onlywnn.cn/figma/h_a4887783.png"
          alt="banner"
          className="w-[375px] h-[549px] object-cover"
        />
        <img
          src="https://img.onlywnn.cn/figma/h_4622448b.png"
          alt="banner"
          className="w-[375px] h-[116px] object-cover"
        />
        <img
          src="https://img.onlywnn.cn/figma/h_6343183e.png"
          alt="banner"
          className="w-[375px] h-[331px] object-cover"
        />

        <img
          src="https://img.onlywnn.cn/figma/h_752bc4b1.png"
          alt="banner"
          className="w-[375px] h-[236px] object-cover"
        />

        {/* My Work Section */}
        <div className="bg-[#FFEAA3] px-[16px] pt-[8px] pb-[8px]">
          <div className="w-[343px] h-[226px] relative rounded-[25px] overflow-hidden">
            <img
              src="/api/images/img_zskahlrauphylA"
              alt="my-work-bg"
              className="w-[343px] h-[226px] object-cover absolute top-0 left-0"
            />
            <div className="absolute top-[70px] left-[16px] w-[311px] bg-white rounded-[16px] flex items-center gap-[16px]">
              {/* Avatar */}
              <div className="pl-[8px] py-[8px] flex items-center gap-[11.67px]">
                <img
                  src="/api/images/img_RBiOKmJlJeAWzw"
                  alt="work-cover"
                  className="w-[124px] h-[124px] rounded-[12px]"
                />
              </div>
              {/* Info */}
              <div className="flex-1 py-[12px] pr-[16px] flex flex-col justify-between h-full">
                <div className="pl-[8px] pr-[8px] flex flex-col gap-[6px]">
                  <div className="flex items-end gap-[34px]">
                    <span className="text-[#404040] text-[20px] font-medium leading-[30px]">
                      魏豆豆
                    </span>
                  </div>
                  <div className="flex items-center gap-[4px] bg-white">
                    <div className="w-[18px] h-[18px]">
                      <img
                        src="https://img.onlywnn.cn/figma/h_4b18edbb.svg"
                        alt="heart"
                        className="w-[17px] h-[14px] mt-[2.25px] ml-[0.75px]"
                      />
                    </div>
                    <span className="text-[#FF715C] text-[18px] font-medium leading-[27px]">
                      12
                    </span>
                  </div>
                </div>
                {/* Share Button */}
                <div className="w-[147px] h-[36px] bg-[#FCDA00] rounded-[32.92px] shadow-[0_2px_0_#F2B61B,0_4.95px_0_rgba(255,255,255,0.25)_inset] flex items-center justify-center">
                  <span className="text-[#6B410B] text-[16.46px] font-[FZLanTingYuan-EB-GBK] tracking-[0.55px] leading-[24.69px]">
                    立即分享
                  </span>
                </div>
              </div>
              {/* Rank badge */}
              <div className="absolute top-[8px] left-[8px] bg-[#FF715C] rounded-tl-[12px] rounded-br-[8px] px-[6px] flex items-center gap-[2px]">
                <span className="text-white text-[12px] font-medium leading-[18px]">
                  排名
                </span>
                <span className="text-white text-[12px] font-medium leading-[18px]">
                  12
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Outstanding Works Section */}
        <div className="bg-[#FFEAA3] px-[16px]">
          <div className="w-[343px] h-[432px] relative bg-[#FFBA39] rounded-[25px] overflow-hidden">
            <img
              src="/api/images/img_krgLOxEh4x3XbQ"
              alt="outstanding-bg"
              className="w-[343px] h-[290px] object-cover absolute top-0 left-0"
            />
            <div className="absolute top-[70px] left-[16px] right-[16px] flex flex-col items-center gap-[12px]">
              {/* Works Grid */}
              <div className="flex items-end gap-[8px] self-stretch">
                {/* Work 1 */}
                <div className="shadow-[0_0_8px_rgba(0,0,0,0.12)] rounded-[12px] outline-1 outline-white overflow-hidden">
                  <div className="flex flex-col">
                    <div className="w-[130px] h-[130px] relative">
                      <img
                        src="/api/images/img_fk7YapfTieqxjQ"
                        alt="work"
                        className="w-[130px] h-[130px]"
                      />
                      <div className="w-[130px] h-[130px] absolute top-0 left-0" />
                    </div>
                    <div className="w-[130px] p-[6px] bg-white flex items-center gap-[4px]">
                      <img
                        src="/api/images/img_-pRxelwbGYzZxQ"
                        alt="avatar"
                        className="w-[26px] h-[26px] rounded-full border border-white/12"
                      />
                      <span className="text-[#404040] text-[14px] font-normal leading-[21px]">
                        骋骋。
                      </span>
                    </div>
                  </div>
                  {/* 示例 tag */}
                  <div className="absolute top-[5px] left-[3px] w-[36px] h-[18px] overflow-hidden rounded-br-[6px]">
                    <div className="w-[30px] h-[15px] absolute top-[1px] left-[2px] bg-black/60 rounded-[4px]" />
                    <span className="absolute top-[1px] left-[6.5px] text-white text-[10px] font-[FZLanTingYuanS-M-GB] tracking-[1px] leading-[15px]">
                      示例
                    </span>
                  </div>
                </div>
                {/* Work 2 */}
                <div className="shadow-[0_0_8px_rgba(0,0,0,0.12)] rounded-[12px] outline-1 outline-white overflow-hidden">
                  <div className="flex flex-col">
                    <div className="w-[130px] h-[130px] relative">
                      <img
                        src="/api/images/img_nwl6IxieGsM7Qw"
                        alt="work"
                        className="w-[130px] h-[130px]"
                      />
                    </div>
                    <div className="w-[130px] p-[6px] bg-white flex items-center gap-[4px]">
                      <img
                        src="/api/images/img_-pRxelwbGYzZxQ"
                        alt="avatar"
                        className="w-[26px] h-[26px] rounded-full border border-white/12"
                      />
                      <span className="text-[#404040] text-[14px] font-normal leading-[21px]">
                        骋骋。
                      </span>
                    </div>
                  </div>
                </div>
                {/* Work 3 */}
                <div className="shadow-[0_0_8px_rgba(0,0,0,0.12)] rounded-[12px] outline-1 outline-white overflow-hidden">
                  <div className="flex flex-col">
                    <div className="w-[130px] h-[130px] relative">
                      <img
                        src="/api/images/img_R12WblovZSEeyA"
                        alt="work"
                        className="w-[130px] h-[130px]"
                      />
                    </div>
                    <div className="w-[130px] p-[6px] bg-white flex items-center gap-[4px]">
                      <img
                        src="/api/images/img_-pRxelwbGYzZxQ"
                        alt="avatar"
                        className="w-[26px] h-[26px] rounded-full border border-white/12"
                      />
                      <span className="text-[#404040] text-[14px] font-normal leading-[21px]">
                        骋骋。
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              {/* Ad */}
              <img
                src="/api/images/img_dxF819a7X-kTFw"
                alt="ad"
                className="w-[311px] h-[166px] object-cover"
              />
            </div>
          </div>
        </div>

        {/* Leaderboard Section */}
        <div className="bg-[#FFEAA3] px-[16px]">
          <div className="w-[343px] h-[751px] relative bg-[#FFC575] rounded-[25px] overflow-hidden">
            <img
              src="/api/images/img_aveqRMF2vH_MpA"
              alt="leaderboard-header"
              className="w-[343px] h-[290px] object-cover absolute top-0 left-0"
            />

            {/* Leaderboard Card */}
            <div className="absolute top-[250px] left-[16px] w-[311px] bg-white rounded-[16px]">
              {/* Top 3 */}
              <div className="flex items-end justify-center absolute top-[-114px] left-0 w-[311px]">
                {/* Rank 2 */}
                <div className="w-[94px] h-[132px] relative">
                  <div className="w-[94px] h-[132px] pt-[6.13px] flex justify-center items-end">
                    <div className="flex-1 bg-gradient-to-b from-transparent to-white bg-[#D0E3FF] rounded-t-[16.35px] border border-white" />
                  </div>
                  <img
                    src="/api/images/img_9UCf6tx2KEazlQ"
                    alt="rank-2-medal"
                    className="w-[66px] h-[34px] object-cover absolute top-0 left-[14px]"
                  />
                  <div className="absolute top-[34px] left-[12px] w-[70px] h-[70px] rounded-[8px] overflow-hidden">
                    <img
                      src="/api/images/img_rVwENaSnkbXyUA"
                      alt="rank-2"
                      className="w-[70px] h-[70px]"
                    />
                    <div className="absolute bottom-0 left-0 w-[70px] bg-gradient-to-t from-black/50 to-transparent flex items-center justify-center gap-[2.04px]">
                      <img
                        src="https://img.onlywnn.cn/figma/h_8a36c0f2.svg"
                        alt="heart"
                        className="w-[11px] h-[10px]"
                      />
                      <span className="text-white text-[13.7px] font-medium leading-[20.56px]">
                        999+
                      </span>
                    </div>
                  </div>
                  <div className="absolute top-[104px] left-0 w-[94px] flex justify-center pt-[2px] pb-[2px]">
                    <span className="text-[#404040] text-[16px] font-normal leading-[24px]">
                      骋骋。
                    </span>
                  </div>
                </div>

                {/* Rank 1 */}
                <div className="w-[123px] h-[167px] relative">
                  <div className="w-[123px] h-[167px] pt-[6.21px] flex justify-center items-end">
                    <div className="flex-1 bg-gradient-to-b from-transparent to-white bg-[#FFF2BB] rounded-t-[16.55px] border border-white" />
                  </div>
                  <img
                    src="/api/images/img_2ihYtvvus-Md0w"
                    alt="rank-1-medal"
                    className="w-[84px] h-[40px] object-cover absolute top-0 left-[19px]"
                  />
                  <div className="absolute top-[40px] left-[12px] w-[99px] h-[99px] rounded-[8px] overflow-hidden">
                    <img
                      src="/api/images/img_21q_4f3rcuOVzA"
                      alt="rank-1"
                      className="w-[99px] h-[99px]"
                    />
                    <div className="absolute bottom-0 left-0 w-[99px] bg-gradient-to-t from-black/50 to-transparent flex items-center justify-center gap-[2.07px]">
                      <img
                        src="https://img.onlywnn.cn/figma/h_bb284646.svg"
                        alt="heart"
                        className="w-[11px] h-[10px]"
                      />
                      <span className="text-white text-[13.88px] font-medium leading-[20.81px]">
                        999+
                      </span>
                    </div>
                  </div>
                  <div className="absolute top-[139px] left-0 w-[123px] h-[28px] flex justify-center pt-[2px] pb-[2px]">
                    <span className="text-[#404040] text-[16px] font-normal leading-[24px]">
                      吴*萱
                    </span>
                  </div>
                </div>

                {/* Rank 3 */}
                <div className="w-[94px] h-[132px] relative">
                  <div className="w-[94px] h-[132px] pt-[6.13px] flex justify-center items-end">
                    <div className="flex-1 bg-gradient-to-b from-transparent to-white bg-[#FFDBAC] rounded-t-[16.35px] border border-white" />
                  </div>
                  <img
                    src="/api/images/img_3F_EYJjDHcqStg"
                    alt="rank-3-medal"
                    className="w-[66px] h-[34px] object-cover absolute top-0 left-[14px]"
                  />
                  <div className="absolute top-[34px] left-[12px] w-[70px] h-[70px] rounded-[8px] overflow-hidden">
                    <img
                      src="/api/images/img_8yuS9C_GiJUCew"
                      alt="rank-3"
                      className="w-[70px] h-[70px]"
                    />
                    <div className="absolute bottom-0 left-0 w-[70px] bg-gradient-to-t from-black/50 to-transparent flex items-center justify-center gap-[2.04px]">
                      <img
                        src="https://img.onlywnn.cn/figma/h_8a36c0f2.svg"
                        alt="heart"
                        className="w-[11px] h-[10px]"
                      />
                      <span className="text-white text-[13.7px] font-medium leading-[20.56px]">
                        999+
                      </span>
                    </div>
                  </div>
                  <div className="absolute top-[104px] left-0 w-[94px] flex justify-center pt-[2px] pb-[2px]">
                    <span className="text-[#404040] text-[16px] font-normal leading-[24px]">
                      骋骋。
                    </span>
                  </div>
                </div>
              </div>

              {/* Ranked List */}
              <div className="absolute top-[57px] left-0 w-[311px] flex flex-col items-end gap-[12px]">
                {/* Rank 4 */}
                <div className="w-[311px] h-[52px] bg-white rounded-[16px] relative">
                  <span className="absolute left-[16px] top-[15.5px] text-[#404040] text-[14px] font-normal leading-[21px]">
                    4
                  </span>
                  <img
                    src="/api/images/img_Z3Rb7Nt6zKiwPA"
                    alt="avatar"
                    className="w-[52px] h-[52px] absolute left-[61px] top-0 rounded-[8px]"
                  />
                  <div className="absolute left-[127px] top-[15.5px] flex items-center gap-[4px]">
                    <span className="text-[#404040] text-[14px] font-normal leading-[21px]">
                      李梓发
                    </span>
                  </div>
                  <div className="absolute left-[225px] top-[19px] flex items-center gap-[4px]">
                    <div className="w-[14px] h-[14px] overflow-hidden">
                      <img
                        src="https://img.onlywnn.cn/figma/h_703a4e8d.svg"
                        alt="heart"
                        className="w-[13px] h-[11px] mt-[1.75px] ml-[0.58px]"
                      />
                    </div>
                    <span className="text-[#FF715C] text-[14px] font-medium leading-[37.4px]">
                      997
                    </span>
                  </div>
                </div>

                {/* Rank 5 */}
                <div className="w-[311px] h-[52px] bg-white rounded-[16px] relative">
                  <span className="absolute left-[16px] top-[15.5px] text-[#404040] text-[14px] font-normal leading-[21px]">
                    5
                  </span>
                  <img
                    src="/api/images/img_BbcC5rwrkNGvjA"
                    alt="avatar"
                    className="w-[52px] h-[52px] absolute left-[61px] top-0 rounded-[8px]"
                  />
                  <div className="absolute left-[127px] top-[15.5px] flex items-center gap-[4px]">
                    <span className="text-[#404040] text-[14px] font-normal leading-[21px]">
                      李世海
                    </span>
                  </div>
                  <div className="absolute left-[225px] top-[19px] flex items-center gap-[4px]">
                    <div className="w-[14px] h-[14px] overflow-hidden">
                      <img
                        src="https://img.onlywnn.cn/figma/h_703a4e8d.svg"
                        alt="heart"
                        className="w-[13px] h-[11px] mt-[1.75px] ml-[0.58px]"
                      />
                    </div>
                    <span className="text-[#FF715C] text-[14px] font-medium leading-[37.4px]">
                      934
                    </span>
                  </div>
                </div>

                {/* Rank 6 */}
                <div className="w-[311px] h-[52px] bg-white rounded-[16px] relative">
                  <span className="absolute left-[16px] top-[15.5px] text-[#404040] text-[14px] font-normal leading-[21px]">
                    6
                  </span>
                  <img
                    src="/api/images/img_q6lMjeyw2jd6Kg"
                    alt="avatar"
                    className="w-[52px] h-[52px] absolute left-[61px] top-0 rounded-[8px]"
                  />
                  <div className="absolute left-[127px] top-[15.5px] flex items-center gap-[4px]">
                    <span className="text-[#404040] text-[14px] font-normal leading-[21px]">
                      吴彦谦
                    </span>
                  </div>
                  <div className="absolute left-[225px] top-[19px] flex items-center gap-[4px]">
                    <div className="w-[14px] h-[14px] overflow-hidden">
                      <img
                        src="https://img.onlywnn.cn/figma/h_703a4e8d.svg"
                        alt="heart"
                        className="w-[13px] h-[11px] mt-[1.75px] ml-[0.58px]"
                      />
                    </div>
                    <span className="text-[#FF715C] text-[14px] font-medium leading-[37.4px]">
                      922
                    </span>
                  </div>
                </div>

                {/* Rank 7 */}
                <div className="w-[311px] h-[52px] bg-white rounded-[16px] relative">
                  <span className="absolute left-[16px] top-[15.5px] text-[#404040] text-[14px] font-normal leading-[21px]">
                    7
                  </span>
                  <img
                    src="/api/images/img_BbcC5rwrkNGvjA"
                    alt="avatar"
                    className="w-[52px] h-[52px] absolute left-[61px] top-0 rounded-[8px]"
                  />
                  <div className="absolute left-[127px] top-[15.5px] flex items-center gap-[4px]">
                    <span className="text-[#404040] text-[14px] font-normal leading-[21px]">
                      钱萌萌
                    </span>
                  </div>
                  <div className="absolute left-[225px] top-[19px] flex items-center gap-[4px]">
                    <div className="w-[14px] h-[14px] overflow-hidden">
                      <div className="w-[12.83px] h-[11.08px] absolute top-[1.75px] left-[0.58px] outline-[1.4px] outline-[#FF715C]" />
                    </div>
                    <span className="text-[#FF715C] text-[14px] font-medium leading-[37.4px]">
                      312
                    </span>
                  </div>
                </div>

                {/* Rank 8 */}
                <div className="w-[311px] h-[52px] bg-white rounded-[16px] relative">
                  <span className="absolute left-[16px] top-[15.5px] text-[#404040] text-[14px] font-normal leading-[21px]">
                    8
                  </span>
                  <img
                    src="/api/images/img_q6lMjeyw2jd6Kg"
                    alt="avatar"
                    className="w-[52px] h-[52px] absolute left-[61px] top-0 rounded-[8px]"
                  />
                  <div className="absolute left-[127px] top-[15.5px] flex items-center gap-[4px]">
                    <span className="text-[#404040] text-[14px] font-normal leading-[21px]">
                      冯启彬
                    </span>
                  </div>
                  <div className="absolute left-[225px] top-[19px] flex items-center gap-[4px]">
                    <div className="w-[14px] h-[14px] overflow-hidden">
                      <img
                        src="https://img.onlywnn.cn/figma/h_703a4e8d.svg"
                        alt="heart"
                        className="w-[13px] h-[11px] mt-[1.75px] ml-[0.58px]"
                      />
                    </div>
                    <span className="text-[#FF715C] text-[14px] font-medium leading-[37.4px]">
                      12
                    </span>
                  </div>
                </div>
              </div>

              {/* "查看更多" */}
              <div className="absolute top-[367px] left-0 w-[311px] flex items-center justify-center gap-[5px]">
                <span className="text-[#B2B2B2] text-[14px] font-medium leading-[21px]">
                  查看更多
                </span>
                <div className="w-[16px] h-[16px] -rotate-90">
                  <img
                    src="https://img.onlywnn.cn/figma/h_85afec08.svg"
                    alt="arrow"
                    className="w-[12px] h-[6px]"
                  />
                </div>
              </div>

              {/* My Rank */}
              <div className="absolute top-[660px] left-0 w-[311px] h-[75px] bg-white rounded-[16px]">
                <span className="absolute left-[16px] top-[27px] text-[#404040] text-[14px] font-normal leading-[21px]">
                  4
                </span>
                <img
                  src="/api/images/img_KUjQDLxnLOoJAA"
                  alt="my-avatar"
                  className="w-[52px] h-[52px] absolute left-[56px] top-[11.93px] rounded-[12px]"
                />
                <div className="absolute left-[108px] top-[25px] flex items-center gap-[12px]">
                  <span className="text-[#404040] text-[14px] font-normal leading-[21px]">
                    我
                  </span>
                  <div className="flex items-center gap-[4px]">
                    <div className="w-[14px] h-[14px] overflow-hidden">
                      <img
                        src="https://img.onlywnn.cn/figma/h_e6430efe.svg"
                        alt="heart"
                        className="w-[13px] h-[11px] mt-[1.75px] ml-[0.58px]"
                      />
                    </div>
                    <span className="text-[#FF715C] text-[14px] font-medium leading-[37.4px]">
                      995
                    </span>
                  </div>
                  <div className="w-[60px] h-[24px] bg-[#FF9045] rounded-[25px] flex items-center justify-center">
                    <span className="text-white text-[12px] font-medium leading-[18px]">
                      分享拉赞
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}