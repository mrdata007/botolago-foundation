const imgHeadshotMohamedElArouch = "https://www.figma.com/api/mcp/asset/2a630505-636c-4942-b121-442fea563de7.png";
const imgNightBand = "https://www.figma.com/api/mcp/asset/bbc3e02e-85f9-4e57-a8a5-162470125237.svg";
const imgEllipse = "https://www.figma.com/api/mcp/asset/c6be75e0-5591-49d2-98d0-efebcd26c27b.svg";
const imgBody = "https://www.figma.com/api/mcp/asset/5c0c97a2-bdac-472e-8cf5-79fb0871b6f8.svg";
const imgSleeves = "https://www.figma.com/api/mcp/asset/1ef45322-88f0-4928-9efa-e0b521b6a2e3.svg";
const imgBody1 = "https://www.figma.com/api/mcp/asset/e1cf0704-916d-4833-810d-6d61b454f4b6.svg";
const imgBody2 = "https://www.figma.com/api/mcp/asset/4c2e2446-29ec-431b-8613-a82aa223c5d4.svg";
const imgSleeves1 = "https://www.figma.com/api/mcp/asset/1561ae7b-eeef-4171-8aef-d6ec0fde6ac7.svg";
const imgMissingPhoto = "https://www.figma.com/api/mcp/asset/8145e55b-458e-459c-8519-324a64489277.svg";

type Seg10BarProps = {
  className?: string;
  theme?: "light";
  value?: "5" | "6" | "7" | "9";
};

function Seg10Bar({ className, theme = "light", value = "5" }: Seg10BarProps) {
  const is6 = value === "6";
  const is7 = value === "7";
  const is9 = value === "9";
  return (
    <div className={className || "content-stretch flex gap-[2px] h-[6px] items-start w-[120px]"} id={is9 ? "node-3_112" : is7 ? "node-3_90" : is6 ? "node-3_79" : "node-3_68"}>
      <div className="bg-[#5de39b] flex-[1_0_0] h-[6px] min-w-px rounded-[1.5px]" id={is9 ? "node-3_113" : is7 ? "node-3_91" : is6 ? "node-3_80" : "node-3_69"} data-name="seg 1" />
      <div className="bg-[#65e0ae] flex-[1_0_0] h-[6px] min-w-px rounded-[1.5px]" id={is9 ? "node-3_114" : is7 ? "node-3_92" : is6 ? "node-3_81" : "node-3_70"} data-name="seg 2" />
      <div className="bg-[#6cddc1] flex-[1_0_0] h-[6px] min-w-px rounded-[1.5px]" id={is9 ? "node-3_115" : is7 ? "node-3_93" : is6 ? "node-3_82" : "node-3_71"} data-name="seg 3" />
      <div className="bg-[#74dad4] flex-[1_0_0] h-[6px] min-w-px rounded-[1.5px]" id={is9 ? "node-3_116" : is7 ? "node-3_94" : is6 ? "node-3_83" : "node-3_72"} data-name="seg 4" />
      <div className="bg-[#7bd7e7] flex-[1_0_0] h-[6px] min-w-px rounded-[1.5px]" id={is9 ? "node-3_117" : is7 ? "node-3_95" : is6 ? "node-3_84" : "node-3_73"} data-name="seg 5" />
      <div className={`flex-[1_0_0] h-[6px] min-w-px rounded-[1.5px] ${["6", "7", "9"].includes(value) ? "bg-[#7fcaf0]" : "bg-[#e3e7f0]"}`} id={is9 ? "node-3_118" : is7 ? "node-3_96" : is6 ? "node-3_85" : "node-3_74"} data-name="seg 6" />
      <div className={`flex-[1_0_0] h-[6px] min-w-px rounded-[1.5px] ${["7", "9"].includes(value) ? "bg-[#7eb3f0]" : "bg-[#e3e7f0]"}`} id={is9 ? "node-3_119" : is7 ? "node-3_97" : is6 ? "node-3_86" : "node-3_75"} data-name="seg 7" />
      <div className={`flex-[1_0_0] h-[6px] min-w-px rounded-[1.5px] ${is9 ? "bg-[#7d9bf0]" : "bg-[#e3e7f0]"}`} id={is9 ? "node-3_120" : is7 ? "node-3_98" : is6 ? "node-3_87" : "node-3_76"} data-name="seg 8" />
      <div className={`flex-[1_0_0] h-[6px] min-w-px rounded-[1.5px] ${is9 ? "bg-[#7d84f0]" : "bg-[#e3e7f0]"}`} id={is9 ? "node-3_121" : is7 ? "node-3_99" : is6 ? "node-3_88" : "node-3_77"} data-name="seg 9" />
      <div className="bg-[#e3e7f0] flex-[1_0_0] h-[6px] min-w-px rounded-[1.5px]" id={is9 ? "node-3_122" : is7 ? "node-3_100" : is6 ? "node-3_89" : "node-3_78"} data-name="seg 10" />
    </div>
  );
}

function HeadshotMohamedElArouch({ className }: { className?: string }) {
  return (
    <div className={className || "overflow-clip rounded-[18px] size-[36px]"} data-name="Headshot / Mohamed El Arouch">
      <div aria-hidden className="absolute inset-0 pointer-events-none rounded-[18px]">
        <div className="absolute inset-0 rounded-[18px]" style={{ backgroundImage: "url(\"data:image/svg+xml;utf8,<svg viewBox='0 0 36 36' xmlns='http://www.w3.org/2000/svg' preserveAspectRatio='none'><rect x='0' y='0' height='100%' width='100%' fill='url(%23grad)' opacity='1'/><defs><radialGradient id='grad' gradientUnits='userSpaceOnUse' cx='0' cy='0' r='10' gradientTransform='matrix(1.8 0 0 1.8 18 28.8)'><stop stop-color='rgba(30,91,184,1)' offset='0'/><stop stop-color='rgba(26,73,151,1)' offset='0.25'/><stop stop-color='rgba(21,56,118,1)' offset='0.5'/><stop stop-color='rgba(17,38,84,1)' offset='0.75'/><stop stop-color='rgba(13,20,51,1)' offset='1'/></radialGradient></defs></svg>\")" }} />
        <img alt="" className="absolute max-w-none object-cover rounded-[18px] size-full" src={imgHeadshotMohamedElArouch} />
      </div>
    </div>
  );
}

type FilterChipProps = {
  className?: string;
  state?: boolean;
  theme?: "light";
};

function FilterChip({ className, state = false, theme = "light" }: FilterChipProps) {
  const isState = state;
  return (
    <div className={className || `border border-solid flex h-[26px] items-center px-[11px] rounded-[999px] ${isState ? "bg-[#1b2a6b] border-[#1b2a6b]" : "bg-white border-[#e3e7f0]"}`} id={isState ? "node-3_258" : "node-3_256"}>
      <p className={`font-["Manrope:ExtraBold"] font-extrabold text-[11px] ${isState ? "text-white" : "text-[#1b2a6b]"}`} id={isState ? "node-3_259" : "node-3_257"}>
        Tous
      </p>
    </div>
  );
}

function GoMarkPepitesData({ className }: { className?: string }) {
  return (
    <div className={className || "content-stretch flex gap-[6px] items-center"} data-name="GoMark / Pépites DATA">
      <div className="bg-white flex h-[22px] items-center justify-center rounded-[6px]" data-name="logo">
        <p className="font-['Manrope:ExtraBold'] font-extrabold text-[#1b2a6b] text-[9px]">
          GO
        </p>
      </div>
      <p className="font-['Manrope:ExtraBold'] font-extrabold text-[12px] text-white">
        Pépites
      </p>
      <div className="bg-gradient-to-r flex from-[#5de39b] items-start px-[5px] py-[3px] rounded-[4px] to-[#7c6cf0] via-[#7fd6f0] via-[45%]" data-name="DATA">
        <p className="font-['IBM_Plex_Mono:SemiBold'] text-[#0b1330] text-[8px] tracking-[1.12px]">
          DATA
        </p>
      </div>
    </div>
  );
}

export default function D1PepitesClassementDesktopFr() {
  return (
    <div className="bg-[#f3f5fa] size-full" data-name="D1 · Pépites — Classement (Desktop FR)">
      <div className="absolute bg-white border-[#e3e7f0] border-b border-solid h-[64px] left-0 top-0 w-[1440px]" data-name="TopBar">
        <p className="absolute font-['Manrope:ExtraBold'] font-extrabold left-[120px] text-[#1b2a6b] text-[20px] top-[19px]">
          BotolaGO
        </p>
        <div className="absolute flex gap-[34px] items-center left-[520px] top-[21px]" data-name="Nav">
          <div className="content-stretch flex flex-col gap-[6px] items-center" data-name="Frame">
            <p className="font-['Manrope:Bold'] font-bold text-[#5d6789] text-[14px]">
              Accueil
            </p>
            <div className="bg-[rgba(255,255,255,0)] h-[3px] w-px" data-name="Rectangle" />
          </div>
          <div className="content-stretch flex flex-col gap-[6px] items-center" data-name="Frame">
            <p className="font-['Manrope:Bold'] font-bold text-[#5d6789] text-[14px]">
              News
            </p>
            <div className="bg-[rgba(255,255,255,0)] h-[3px] w-px" data-name="Rectangle" />
          </div>
          <div className="content-stretch flex flex-col gap-[6px] items-center" data-name="Frame">
            <p className="font-['Manrope:Bold'] font-bold text-[#5d6789] text-[14px]">
              Fantasy
            </p>
            <div className="bg-[rgba(255,255,255,0)] h-[3px] w-px" data-name="Rectangle" />
          </div>
          <div className="content-stretch flex flex-col gap-[6px] items-center" data-name="Frame">
            <p className="font-['Manrope:Bold'] font-bold text-[#5d6789] text-[14px]">
              Matchs
            </p>
            <div className="bg-[rgba(255,255,255,0)] h-[3px] w-px" data-name="Rectangle" />
          </div>
          <div className="content-stretch flex flex-col gap-[6px] items-center" data-name="Frame">
            <p className="font-['Manrope:Bold'] font-bold text-[#1b2a6b] text-[14px]">
              Pépites
            </p>
            <div className="bg-gradient-to-r from-[#5de39b] h-[3px] to-[#7c6cf0] via-[#7fd6f0] via-[45%] w-[48px]" data-name="Rectangle" />
          </div>
        </div>
        <div className="absolute bg-[#1b2a6b] flex h-[34px] items-center justify-center left-[1286px] rounded-[17px] top-[15px]" data-name="Avatar → Profil">
          <p className="font-['Manrope:ExtraBold'] font-extrabold text-[11px] text-white">
            AS
          </p>
        </div>
      </div>
      <div className="absolute h-[390px] left-0 top-[64px] w-[1440px]" data-name="Night band">
        <div className="absolute inset-[-0.13%_0]">
          <img alt="" className="block max-w-none size-full" src={imgNightBand} />
        </div>
      </div>
      <div className="absolute left-[-120px] size-[420px] top-[-40px]" data-name="Ellipse">
        <div className="absolute inset-[-28.57%]">
          <img alt="" className="block max-w-none size-full" src={imgEllipse} />
        </div>
      </div>
      <div className="absolute flex h-[546.669px] items-center justify-center left-[393.47px] top-[60px] w-[405.534px]">
        <div className="flex-none scale-y-99 skew-x-[-7.97deg]">
          <p className="font-['Changa:ExtraBold'] font-extrabold text-[300px] text-[transparent]">27</p>
        </div>
      </div>
      <GoMarkPepitesData className="absolute flex gap-[6px] items-center left-[120px] top-[100px]" />
      <div className="absolute flex h-[102.005px] items-center justify-center left-[107.72px] top-[134px] w-[428.281px]">
        <div className="flex-none scale-y-99 skew-x-[-7.97deg]">
          <p className="font-['Changa:ExtraBold'] font-extrabold text-[56px] text-white">Classement U23</p>
        </div>
      </div>
      <p className="absolute font-['IBM_Plex_Mono:Medium'] left-[120px] text-[#9aa4c7] text-[11px] top-[214px] tracking-[0.88px]">
        BOTOLA PRO · SAISON 2025-26 · 27 JOUEURS · 600+ MIN · MAJ LUN. 20:00
      </p>
      <div className="absolute font-['Manrope:SemiBold'] font-semibold leading-[0] left-[120px] text-[#c9d2ea] text-[15px] top-[244px]">
        <p className="leading-[normal] mb-0">Les joueurs de moins de 23 ans qui montent le plus vite, classés par le Rising score :</p>
        <p className="leading-[normal]">note, forme, contribution, progression et temps de jeu.</p>
      </div>
      <p className="absolute font-['Manrope:ExtraBold'] font-extrabold left-[120px] text-[#5de39b] text-[14px] top-[300px]">
        Comment on calcule →
      </p>
      <div className="absolute flex gap-[16px] items-start left-[706px] top-[100px]" data-name="Podium">
        <div className="bg-gradient-to-b border border-[rgba(255,255,255,0.14)] border-solid from-[rgba(230,57,0,0.55)] h-[250px] rounded-[16px] to-[#0d1738] w-[190px]" data-name="#1 Baba Bello Ilou">
          <div className="absolute flex h-[116.86px] items-center justify-center left-[-5.36px] top-[-5px] w-[51.36px]">
            <div className="flex-none scale-y-99 skew-x-[-7.97deg]">
              <p className="font-['Changa:ExtraBold'] font-extrabold text-[64px] text-[transparent]">1</p>
            </div>
          </div>
          <div className="absolute drop-shadow-[0px_10px_8px_rgba(0,0,0,0.45)] h-[103px] left-[39px] top-[39px] w-[110px]" data-name="ShirtFallback">
            <div className="absolute h-[120px] left-[2px] top-[4px] w-[128px]" data-name="body">
              <div className="absolute inset-[-0.44%_-0.52%_-0.42%_-0.52%]">
                <img alt="" className="block max-w-none size-full" src={imgBody} />
              </div>
            </div>
            <div className="absolute h-[53.333px] left-[2px] top-[7.76px] w-[128px]" data-name="sleeves">
              <div className="absolute inset-[-2.05%_-0.52%_-1.23%_-0.52%]">
                <img alt="" className="block max-w-none size-full" src={imgSleeves} />
              </div>
            </div>
            <p className="-translate-x-1/2 absolute font-['Changa:ExtraBold'] font-extrabold left-[64px] text-[12px] text-center text-white top-[34px] w-[90px]">
              ILOU
            </p>
            <p className="-translate-x-1/2 absolute font-['Changa:ExtraBold'] font-extrabold h-[36px] left-[64px] text-[34px] text-center text-white top-[58px] w-[90px]">
              1
            </p>
          </div>
          <p className="absolute font-['Changa:ExtraBold'] font-extrabold left-[13px] text-[17px] text-white top-[151px]">
            Baba Bello Ilou
          </p>
          <p className="absolute font-['IBM_Plex_Mono:Medium'] left-[13px] text-[#c9d2ea] text-[9px] top-[177px] tracking-[0.54px]">
            HASSANIA AGADIR · ATT
          </p>
          <div className="absolute flex h-[73.285px] items-center justify-center left-[2.74px] top-[195px] w-[60.26px]">
            <div className="flex-none scale-y-99 skew-x-[-7.97deg]">
              <p className="bg-clip-text bg-gradient-to-r font-['Changa:ExtraBold'] font-extrabold from-[#5de39b] text-[40px] text-[transparent] to-[#7c6cf0] via-[#7fd6f0] via-[45%]">88</p>
            </div>
          </div>
          <p className="absolute font-['IBM_Plex_Mono:SemiBold'] left-[69px] text-[#9aa4c7] text-[8px] top-[221px] tracking-[1.12px]">
            RISING
          </p>
        </div>
        <div className="bg-gradient-to-b border border-[rgba(255,255,255,0.14)] border-solid from-[rgba(30,91,184,0.55)] h-[250px] rounded-[16px] to-[#0d1738] w-[190px]" data-name="#2 Abdelhamid Maali">
          <div className="absolute flex h-[116.86px] items-center justify-center left-[-5.36px] top-[-5px] w-[55.36px]">
            <div className="flex-none scale-y-99 skew-x-[-7.97deg]">
              <p className="font-['Changa:ExtraBold'] font-extrabold text-[64px] text-[transparent]">2</p>
            </div>
          </div>
          <div className="absolute drop-shadow-[0px_10px_8px_rgba(0,0,0,0.45)] h-[103px] left-[39px] top-[39px] w-[110px]" data-name="ShirtFallback">
            <div className="absolute h-[120px] left-[2px] top-[4px] w-[128px]" data-name="body">
              <div className="absolute inset-[-0.44%_-0.52%_-0.42%_-0.52%]">
                <img alt="" className="block max-w-none size-full" src={imgBody1} />
              </div>
            </div>
            <div className="absolute h-[53.333px] left-[2px] top-[7.76px] w-[128px]" data-name="sleeves">
              <div className="absolute inset-[-2.05%_-0.52%_-1.23%_-0.52%]">
                <img alt="" className="block max-w-none size-full" src={imgSleeves} />
              </div>
            </div>
            <p className="-translate-x-1/2 absolute font-['Changa:ExtraBold'] font-extrabold left-[64px] text-[12px] text-center text-white top-[34px] w-[90px]">
              MAALI
            </p>
            <p className="-translate-x-1/2 absolute font-['Changa:ExtraBold'] font-extrabold h-[36px] left-[64px] text-[34px] text-center text-white top-[58px] w-[90px]">
              2
            </p>
          </div>
          <p className="absolute font-['Changa:ExtraBold'] font-extrabold left-[13px] text-[17px] text-white top-[151px]">
            Abdelhamid Maali
          </p>
          <p className="absolute font-['IBM_Plex_Mono:Medium'] left-[13px] text-[#c9d2ea] text-[9px] top-[177px] tracking-[0.54px]">
            ITTIHAD TANGER · ATT
          </p>
          <div className="absolute flex h-[73.285px] items-center justify-center left-[2.74px] top-[195px] w-[60.26px]">
            <div className="flex-none scale-y-99 skew-x-[-7.97deg]">
              <p className="bg-clip-text bg-gradient-to-r font-['Changa:ExtraBold'] font-extrabold from-[#5de39b] text-[40px] text-[transparent] to-[#7c6cf0] via-[#7fd6f0] via-[45%]">86</p>
            </div>
          </div>
          <p className="absolute font-['IBM_Plex_Mono:SemiBold'] left-[69px] text-[#9aa4c7] text-[8px] top-[221px] tracking-[1.12px]">
            RISING
          </p>
        </div>
        <div className="bg-gradient-to-b border border-[rgba(255,255,255,0.14)] border-solid from-[rgba(17,17,17,0.55)] h-[250px] rounded-[16px] to-[#0d1738] w-[190px]" data-name="#3 Hakim Mesbahi">
          <div className="absolute flex h-[116.86px] items-center justify-center left-[-5.36px] top-[-5px] w-[52.36px]">
            <div className="flex-none scale-y-99 skew-x-[-7.97deg]">
              <p className="font-['Changa:ExtraBold'] font-extrabold text-[64px] text-[transparent]">3</p>
            </div>
          </div>
          <div className="absolute drop-shadow-[0px_10px_8px_rgba(0,0,0,0.45)] h-[103px] left-[39px] top-[39px] w-[110px]" data-name="ShirtFallback">
            <div className="absolute h-[120px] left-[2px] top-[4px] w-[128px]" data-name="body">
              <div className="absolute inset-[-0.44%_-0.52%_-0.42%_-0.52%]">
                <img alt="" className="block max-w-none size-full" src={imgBody2} />
              </div>
            </div>
            <div className="absolute h-[53.333px] left-[2px] top-[7.76px] w-[128px]" data-name="sleeves">
              <div className="absolute inset-[-2.05%_-0.52%_-1.23%_-0.52%]">
                <img alt="" className="block max-w-none size-full" src={imgSleeves1} />
              </div>
            </div>
            <p className="-translate-x-1/2 absolute font-['Changa:ExtraBold'] font-extrabold left-[64px] text-[12px] text-center text-white top-[34px] w-[90px]">
              MESBAHI
            </p>
            <p className="-translate-x-1/2 absolute font-['Changa:ExtraBold'] font-extrabold h-[36px] left-[64px] text-[34px] text-center text-white top-[58px] w-[90px]">
              3
            </p>
          </div>
          <p className="absolute font-['Changa:ExtraBold'] font-extrabold left-[13px] text-[17px] text-white top-[151px]">
            Hakim Mesbahi
          </p>
          <p className="absolute font-['IBM_Plex_Mono:Medium'] left-[13px] text-[#c9d2ea] text-[9px] top-[177px] tracking-[0.54px]">
            FAR RABAT · GB
          </p>
          <div className="absolute flex h-[73.285px] items-center justify-center left-[2.74px] top-[195px] w-[53.26px]">
            <div className="flex-none scale-y-99 skew-x-[-7.97deg]">
              <p className="bg-clip-text bg-gradient-to-r font-['Changa:ExtraBold'] font-extrabold from-[#5de39b] text-[40px] text-[transparent] to-[#7c6cf0] via-[#7fd6f0] via-[45%]">73</p>
            </div>
          </div>
          <p className="absolute font-['IBM_Plex_Mono:SemiBold'] left-[69px] text-[#9aa4c7] text-[8px] top-[221px] tracking-[1.12px]">
            RISING
          </p>
        </div>
      </div>
      <div className="absolute flex gap-[8px] items-start left-[120px] top-[470px]" data-name="Filters">
        <FilterChip className="bg-[#1b2a6b] border border-[#1b2a6b] border-solid flex h-[26px] items-center px-[11px] rounded-[999px]" state />
        <div className="bg-white border border-[#e3e7f0] border-solid flex h-[26px] items-center px-[11px] rounded-[999px]" data-name="FilterChip">
          <p className="font-['Manrope:ExtraBold'] font-extrabold text-[#1b2a6b] text-[11px]">
            ATT
          </p>
        </div>
        <div className="bg-white border border-[#e3e7f0] border-solid flex h-[26px] items-center px-[11px] rounded-[999px]" data-name="FilterChip">
          <p className="font-['Manrope:ExtraBold'] font-extrabold text-[#1b2a6b] text-[11px]">
            MIL
          </p>
        </div>
        <div className="bg-white border border-[#e3e7f0] border-solid flex h-[26px] items-center px-[11px] rounded-[999px]" data-name="FilterChip">
          <p className="font-['Manrope:ExtraBold'] font-extrabold text-[#1b2a6b] text-[11px]">
            DEF
          </p>
        </div>
        <div className="bg-white border border-[#e3e7f0] border-solid flex h-[26px] items-center px-[11px] rounded-[999px]" data-name="FilterChip">
          <p className="font-['Manrope:ExtraBold'] font-extrabold text-[#1b2a6b] text-[11px]">
            GB
          </p>
        </div>
        <div className="bg-white border border-[#e3e7f0] border-solid flex h-[26px] items-center px-[11px] rounded-[999px]" data-name="FilterChip">
          <p className="font-['Manrope:ExtraBold'] font-extrabold text-[#1b2a6b] text-[11px]">
            ≤ 20 ans
          </p>
        </div>
        <div className="bg-white border border-[#e3e7f0] border-solid flex h-[26px] items-center px-[11px] rounded-[999px]" data-name="FilterChip">
          <p className="font-['Manrope:ExtraBold'] font-extrabold text-[#1b2a6b] text-[11px]">
            Club ▾
          </p>
        </div>
        <div className="bg-white border border-[#e3e7f0] border-solid flex h-[26px] items-center px-[11px] rounded-[999px]" data-name="FilterChip">
          <p className="font-['Manrope:ExtraBold'] font-extrabold text-[#1b2a6b] text-[11px]">
            Minutes min. ▾
          </p>
        </div>
      </div>
      <p className="absolute font-['Manrope:Bold'] font-bold left-[1161px] text-[#1b2a6b] text-[13px] top-[476px]">
        Trier par : Rising score ▾
      </p>
      <div className="absolute bg-white flex flex-col items-start left-[120px] px-[20px] py-[8px] rounded-[16px] shadow-[0px_8px_24px_0px_rgba(11,19,48,0.07)] top-[516px]" data-name="Ranking table">
        <div className="border-[#eef1f6] border-b border-solid flex font-['IBM_Plex_Mono:SemiBold'] gap-[6px] items-center py-[12px] text-[10px] tracking-[0.8px]" data-name="Frame">
          <p className="h-[18px] text-[#5d6789] w-[30px]">
            #
          </p>
          <p className="h-[18px] text-[#5d6789] w-[240px]">
            JOUEUR
          </p>
          <p className="h-[18px] text-[#5d6789] w-[60px]">
            POSTE
          </p>
          <p className="h-[18px] text-[#5d6789] text-right w-[50px]">
            ÂGE
          </p>
          <p className="h-[18px] text-[#5d6789] text-right w-[50px]">
            MJ
          </p>
          <p className="h-[18px] text-[#5d6789] text-right w-[50px]">
            TIT.
          </p>
          <p className="h-[18px] text-[#5d6789] text-right w-[62px]">
            MIN
          </p>
          <p className="h-[18px] text-[#5d6789] text-right w-[50px]">
            BUTS
          </p>
          <p className="h-[18px] text-[#5d6789] text-right w-[40px]">
            PD
          </p>
          <p className="h-[18px] text-[#5d6789] text-right w-[70px]">
            B+PD/90
          </p>
          <p className="h-[18px] text-[#5d6789] text-right w-[62px]">
            NOTE
          </p>
          <p className="h-[18px] text-[#5d6789] text-right w-[62px]">
            FORME
          </p>
          <p className="h-[18px] text-[#5d6789] text-right w-[80px]">
            2DE MOITIÉ
          </p>
          <p className="font-semibold h-[18px] text-[#1b2a6b] text-right w-[164px]" style={{ fontVariationSettings: '"CTGR" 0, "wdth" 100' }}>
            RISING SCORE ▼
          </p>
        </div>
        <div className="border-[#eef1f6] border-b border-solid flex gap-[6px] items-center py-[9px]" data-name="Frame">
          <p className="font-['Changa:ExtraBold'] font-extrabold h-[18px] text-[#1b2a6b] text-[16px] w-[30px]">
            1
          </p>
          <div className="content-stretch flex gap-[12px] items-center w-[240px]" data-name="Frame">
            <div className="content-stretch flex items-center justify-center rounded-[18px] size-[36px]" style={{ backgroundImage: "url(\"data:image/svg+xml;utf8,<svg viewBox='0 0 36 36' xmlns='http://www.w3.org/2000/svg' preserveAspectRatio='none'><rect x='0' y='0' height='100%' width='100%' fill='url(%23grad)' opacity='1'/><defs><radialGradient id='grad' gradientUnits='userSpaceOnUse' cx='0' cy='0' r='10' gradientTransform='matrix(1.8 0 0 1.8 18 28.8)'><stop stop-color='rgba(230,57,0,1)' offset='0'/><stop stop-color='rgba(175,46,8,1)' offset='0.25'/><stop stop-color='rgba(120,35,15,1)' offset='0.5'/><stop stop-color='rgba(93,29,19,1)' offset='0.625'/><stop stop-color='rgba(65,24,23,1)' offset='0.75'/><stop stop-color='rgba(38,18,27,1)' offset='0.875'/><stop stop-color='rgba(10,13,31,1)' offset='1'/></radialGradient></defs></svg>\")" }} data-name="Headshot / placeholder">
              <p className="font-['Changa:ExtraBold'] font-extrabold text-[13px] text-white">
                BB
              </p>
              <div className="absolute left-[26px] size-[9px] top-[26px]" data-name="missing photo">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgMissingPhoto} />
              </div>
            </div>
            <div className="content-stretch flex flex-col gap-px items-start" data-name="Frame">
              <p className="font-['Manrope:ExtraBold'] font-extrabold text-[#0b1330] text-[14px]">
                Baba Bello Ilou
              </p>
              <p className="font-['Manrope:SemiBold'] font-semibold text-[#5d6789] text-[12px]">
                Hassania Agadir
              </p>
            </div>
          </div>
          <div className="content-stretch flex h-[22px] items-center w-[60px]" data-name="Frame">
            <div className="bg-[#e8ecfb] flex items-start px-[7px] py-[3px] rounded-[4px]" data-name="Frame">
              <p className="font-['IBM_Plex_Mono:SemiBold'] text-[#1b2a6b] text-[10px]">
                ATT
              </p>
            </div>
          </div>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[50px]">
            21
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[50px]">
            28
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[50px]">
            23
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[62px]">
            2 087
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[50px]">
            16
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[40px]">
            1
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[70px]">
            0,73
          </p>
          <div className="content-stretch flex h-[22px] items-center justify-end w-[62px]" data-name="Frame">
            <div className="bg-[#9bc53d] flex h-[20px] items-center justify-center px-[6px] rounded-[5px] w-[34px]" data-name="RatingChip">
              <p className="font-['Manrope:ExtraBold'] font-extrabold text-[11px] text-white">
                6,90
              </p>
            </div>
          </div>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[62px]">
            6,93
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[80px]">
            71 %
          </p>
          <div className="content-stretch flex gap-[10px] items-center justify-end w-[164px]" data-name="Frame">
            <Seg10Bar className="content-stretch flex gap-[2px] h-[6px] items-start w-[100px]" value="9" />
            <p className="font-['Changa:ExtraBold'] font-extrabold text-[#1b2a6b] text-[20px]">
              88
            </p>
          </div>
        </div>
        <div className="border-[#eef1f6] border-b border-solid flex gap-[6px] items-center py-[9px]" data-name="Frame">
          <p className="font-['Changa:ExtraBold'] font-extrabold h-[18px] text-[#1b2a6b] text-[16px] w-[30px]">
            2
          </p>
          <div className="content-stretch flex gap-[12px] items-center w-[240px]" data-name="Frame">
            <div className="content-stretch flex items-center justify-center rounded-[18px] size-[36px]" style={{ backgroundImage: "url(\"data:image/svg+xml;utf8,<svg viewBox='0 0 36 36' xmlns='http://www.w3.org/2000/svg' preserveAspectRatio='none'><rect x='0' y='0' height='100%' width='100%' fill='url(%23grad)' opacity='1'/><defs><radialGradient id='grad' gradientUnits='userSpaceOnUse' cx='0' cy='0' r='10' gradientTransform='matrix(1.8 0 0 1.8 18 28.8)'><stop stop-color='rgba(30,91,184,1)' offset='0'/><stop stop-color='rgba(25,71,146,1)' offset='0.25'/><stop stop-color='rgba(20,52,107,1)' offset='0.5'/><stop stop-color='rgba(15,32,69,1)' offset='0.75'/><stop stop-color='rgba(13,23,50,1)' offset='0.875'/><stop stop-color='rgba(10,13,31,1)' offset='1'/></radialGradient></defs></svg>\")" }} data-name="Headshot / placeholder">
              <p className="font-['Changa:ExtraBold'] font-extrabold text-[13px] text-white">
                AM
              </p>
              <div className="absolute left-[26px] size-[9px] top-[26px]" data-name="missing photo">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgMissingPhoto} />
              </div>
            </div>
            <div className="content-stretch flex flex-col gap-px items-start" data-name="Frame">
              <p className="font-['Manrope:ExtraBold'] font-extrabold text-[#0b1330] text-[14px]">
                Abdelhamid Maali
              </p>
              <p className="font-['Manrope:SemiBold'] font-semibold text-[#5d6789] text-[12px]">
                Ittihad Tanger
              </p>
            </div>
          </div>
          <div className="content-stretch flex h-[22px] items-center w-[60px]" data-name="Frame">
            <div className="bg-[#e8ecfb] flex items-start px-[7px] py-[3px] rounded-[4px]" data-name="Frame">
              <p className="font-['IBM_Plex_Mono:SemiBold'] text-[#1b2a6b] text-[10px]">
                ATT
              </p>
            </div>
          </div>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[50px]">
            20
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[50px]">
            21
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[50px]">
            13
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[62px]">
            1 275
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[50px]">
            0
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[40px]">
            8
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[70px]">
            0,56
          </p>
          <div className="content-stretch flex h-[22px] items-center justify-end w-[62px]" data-name="Frame">
            <div className="bg-[#9bc53d] flex h-[20px] items-center justify-center px-[6px] rounded-[5px] w-[34px]" data-name="RatingChip">
              <p className="font-['Manrope:ExtraBold'] font-extrabold text-[11px] text-white">
                6,90
              </p>
            </div>
          </div>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[62px]">
            6,80
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[80px]">
            95 %
          </p>
          <div className="content-stretch flex gap-[10px] items-center justify-end w-[164px]" data-name="Frame">
            <Seg10Bar className="content-stretch flex gap-[2px] h-[6px] items-start w-[100px]" value="9" />
            <p className="font-['Changa:ExtraBold'] font-extrabold text-[#1b2a6b] text-[20px]">
              86
            </p>
          </div>
        </div>
        <div className="border-[#eef1f6] border-b border-solid flex gap-[6px] items-center py-[9px]" data-name="Frame">
          <p className="font-['Changa:ExtraBold'] font-extrabold h-[18px] text-[#1b2a6b] text-[16px] w-[30px]">
            3
          </p>
          <div className="content-stretch flex gap-[12px] items-center w-[240px]" data-name="Frame">
            <div className="content-stretch flex items-center justify-center rounded-[18px] size-[36px]" style={{ backgroundImage: "url(\"data:image/svg+xml;utf8,<svg viewBox='0 0 36 36' xmlns='http://www.w3.org/2000/svg' preserveAspectRatio='none'><rect x='0' y='0' height='100%' width='100%' fill='url(%23grad)' opacity='1'/><defs><radialGradient id='grad' gradientUnits='userSpaceOnUse' cx='0' cy='0' r='10' gradientTransform='matrix(1.8 0 0 1.8 18 28.8)'><stop stop-color='rgba(17,17,17,1)' offset='0'/><stop stop-color='rgba(10,13,31,1)' offset='1'/></radialGradient></defs></svg>\")" }} data-name="Headshot / placeholder">
              <p className="font-['Changa:ExtraBold'] font-extrabold text-[13px] text-white">
                HM
              </p>
              <div className="absolute left-[26px] size-[9px] top-[26px]" data-name="missing photo">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgMissingPhoto} />
              </div>
            </div>
            <div className="content-stretch flex flex-col gap-px items-start" data-name="Frame">
              <p className="font-['Manrope:ExtraBold'] font-extrabold text-[#0b1330] text-[14px]">
                Hakim Mesbahi
              </p>
              <p className="font-['Manrope:SemiBold'] font-semibold text-[#5d6789] text-[12px]">
                FAR Rabat
              </p>
            </div>
          </div>
          <div className="content-stretch flex h-[22px] items-center w-[60px]" data-name="Frame">
            <div className="bg-[#e8ecfb] flex items-start px-[7px] py-[3px] rounded-[4px]" data-name="Frame">
              <p className="font-['IBM_Plex_Mono:SemiBold'] text-[#1b2a6b] text-[10px]">
                GB
              </p>
            </div>
          </div>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[50px]">
            21
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[50px]">
            12
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[50px]">
            11
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[62px]">
            1 003
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[50px]">
            0
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[40px]">
            0
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[70px]">
            0,00
          </p>
          <div className="content-stretch flex h-[22px] items-center justify-end w-[62px]" data-name="Frame">
            <div className="bg-[#9bc53d] flex h-[20px] items-center justify-center px-[6px] rounded-[5px] w-[34px]" data-name="RatingChip">
              <p className="font-['Manrope:ExtraBold'] font-extrabold text-[11px] text-white">
                6,71
              </p>
            </div>
          </div>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[62px]">
            6,45
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[80px]">
            100 %
          </p>
          <div className="content-stretch flex gap-[10px] items-center justify-end w-[164px]" data-name="Frame">
            <Seg10Bar className="content-stretch flex gap-[2px] h-[6px] items-start w-[100px]" value="7" />
            <p className="font-['Changa:ExtraBold'] font-extrabold text-[#1b2a6b] text-[20px]">
              73
            </p>
          </div>
        </div>
        <div className="border-[#eef1f6] border-b border-solid flex gap-[6px] items-center py-[9px]" data-name="Frame">
          <p className="font-['Changa:ExtraBold'] font-extrabold h-[18px] text-[#1b2a6b] text-[16px] w-[30px]">
            4
          </p>
          <div className="content-stretch flex gap-[12px] items-center w-[240px]" data-name="Frame">
            <div className="content-stretch flex items-center justify-center rounded-[18px] size-[36px]" style={{ backgroundImage: "url(\"data:image/svg+xml;utf8,<svg viewBox='0 0 36 36' xmlns='http://www.w3.org/2000/svg' preserveAspectRatio='none'><rect x='0' y='0' height='100%' width='100%' fill='url(%23grad)' opacity='1'/><defs><radialGradient id='grad' gradientUnits='userSpaceOnUse' cx='0' cy='0' r='10' gradientTransform='matrix(1.8 0 0 1.8 18 28.8)'><stop stop-color='rgba(10,122,60,1)' offset='0'/><stop stop-color='rgba(10,95,53,1)' offset='0.25'/><stop stop-color='rgba(10,67,45,1)' offset='0.5'/><stop stop-color='rgba(10,40,38,1)' offset='0.75'/><stop stop-color='rgba(10,13,31,1)' offset='1'/></radialGradient></defs></svg>\")" }} data-name="Headshot / placeholder">
              <p className="font-['Changa:ExtraBold'] font-extrabold text-[13px] text-white">
                EM
              </p>
              <div className="absolute left-[26px] size-[9px] top-[26px]" data-name="missing photo">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgMissingPhoto} />
              </div>
            </div>
            <div className="content-stretch flex flex-col gap-px items-start" data-name="Frame">
              <p className="font-['Manrope:ExtraBold'] font-extrabold text-[#0b1330] text-[14px]">
                Enzo Mori
              </p>
              <p className="font-['Manrope:SemiBold'] font-semibold text-[#5d6789] text-[12px]">
                CODM Meknès
              </p>
            </div>
          </div>
          <div className="content-stretch flex h-[22px] items-center w-[60px]" data-name="Frame">
            <div className="bg-[#e8ecfb] flex items-start px-[7px] py-[3px] rounded-[4px]" data-name="Frame">
              <p className="font-['IBM_Plex_Mono:SemiBold'] text-[#1b2a6b] text-[10px]">
                MIL
              </p>
            </div>
          </div>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[50px]">
            20
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[50px]">
            12
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[50px]">
            8
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[62px]">
            812
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[50px]">
            1
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[40px]">
            2
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[70px]">
            0,33
          </p>
          <div className="content-stretch flex h-[22px] items-center justify-end w-[62px]" data-name="Frame">
            <div className="bg-[#9bc53d] flex h-[20px] items-center justify-center px-[6px] rounded-[5px] w-[34px]" data-name="RatingChip">
              <p className="font-['Manrope:ExtraBold'] font-extrabold text-[11px] text-white">
                6,78
              </p>
            </div>
          </div>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[62px]">
            6,95
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[80px]">
            80 %
          </p>
          <div className="content-stretch flex gap-[10px] items-center justify-end w-[164px]" data-name="Frame">
            <Seg10Bar className="content-stretch flex gap-[2px] h-[6px] items-start w-[100px]" value="7" />
            <p className="font-['Changa:ExtraBold'] font-extrabold text-[#1b2a6b] text-[20px]">
              71
            </p>
          </div>
        </div>
        <div className="border-[#eef1f6] border-b border-solid flex gap-[6px] items-center py-[9px]" data-name="Frame">
          <p className="font-['Changa:ExtraBold'] font-extrabold h-[18px] text-[#1b2a6b] text-[16px] w-[30px]">
            5
          </p>
          <div className="content-stretch flex gap-[12px] items-center w-[240px]" data-name="Frame">
            <HeadshotMohamedElArouch className="relative rounded-[18px] size-[36px]" />
            <div className="content-stretch flex flex-col gap-px items-start" data-name="Frame">
              <p className="font-['Manrope:ExtraBold'] font-extrabold text-[#0b1330] text-[14px]">
                Mohamed El Arouch
              </p>
              <p className="font-['Manrope:SemiBold'] font-semibold text-[#5d6789] text-[12px]">
                Ittihad Tanger
              </p>
            </div>
          </div>
          <div className="content-stretch flex h-[22px] items-center w-[60px]" data-name="Frame">
            <div className="bg-[#e8ecfb] flex items-start px-[7px] py-[3px] rounded-[4px]" data-name="Frame">
              <p className="font-['IBM_Plex_Mono:SemiBold'] text-[#1b2a6b] text-[10px]">
                DEF
              </p>
            </div>
          </div>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[50px]">
            22
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[50px]">
            17
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[50px]">
            15
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[62px]">
            1 159
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[50px]">
            1
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[40px]">
            1
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[70px]">
            0,16
          </p>
          <div className="content-stretch flex h-[22px] items-center justify-end w-[62px]" data-name="Frame">
            <div className="bg-[#9bc53d] flex h-[20px] items-center justify-center px-[6px] rounded-[5px] w-[34px]" data-name="RatingChip">
              <p className="font-['Manrope:ExtraBold'] font-extrabold text-[11px] text-white">
                6,60
              </p>
            </div>
          </div>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[62px]">
            6,72
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[80px]">
            87 %
          </p>
          <div className="content-stretch flex gap-[10px] items-center justify-end w-[164px]" data-name="Frame">
            <Seg10Bar className="content-stretch flex gap-[2px] h-[6px] items-start w-[100px]" value="7" />
            <p className="font-['Changa:ExtraBold'] font-extrabold text-[#1b2a6b] text-[20px]">
              70
            </p>
          </div>
        </div>
        <div className="border-[#eef1f6] border-b border-solid flex gap-[6px] items-center py-[9px]" data-name="Frame">
          <p className="font-['Changa:ExtraBold'] font-extrabold h-[18px] text-[#1b2a6b] text-[16px] w-[30px]">
            6
          </p>
          <div className="content-stretch flex gap-[12px] items-center w-[240px]" data-name="Frame">
            <div className="content-stretch flex items-center justify-center rounded-[18px] size-[36px]" style={{ backgroundImage: "url(\"data:image/svg+xml;utf8,<svg viewBox='0 0 36 36' xmlns='http://www.w3.org/2000/svg' preserveAspectRatio='none'><rect x='0' y='0' height='100%' width='100%' fill='url(%23grad)' opacity='1'/><defs><radialGradient id='grad' gradientUnits='userSpaceOnUse' cx='0' cy='0' r='10' gradientTransform='matrix(1.8 0 0 1.8 18 28.8)'><stop stop-color='rgba(10,122,60,1)' offset='0'/><stop stop-color='rgba(10,95,53,1)' offset='0.25'/><stop stop-color='rgba(10,67,45,1)' offset='0.5'/><stop stop-color='rgba(10,40,38,1)' offset='0.75'/><stop stop-color='rgba(10,13,31,1)' offset='1'/></radialGradient></defs></svg>\")" }} data-name="Headshot / placeholder">
              <p className="font-['Changa:ExtraBold'] font-extrabold text-[13px] text-white">
                AS
              </p>
              <div className="absolute left-[26px] size-[9px] top-[26px]" data-name="missing photo">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgMissingPhoto} />
              </div>
            </div>
            <div className="content-stretch flex flex-col gap-px items-start" data-name="Frame">
              <p className="font-['Manrope:ExtraBold'] font-extrabold text-[#0b1330] text-[14px]">
                Abdoulaye Sanogo
              </p>
              <p className="font-['Manrope:SemiBold'] font-semibold text-[#5d6789] text-[12px]">
                Difaâ El Jadida
              </p>
            </div>
          </div>
          <div className="content-stretch flex h-[22px] items-center w-[60px]" data-name="Frame">
            <div className="bg-[#e8ecfb] flex items-start px-[7px] py-[3px] rounded-[4px]" data-name="Frame">
              <p className="font-['IBM_Plex_Mono:SemiBold'] text-[#1b2a6b] text-[10px]">
                DEF
              </p>
            </div>
          </div>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[50px]">
            22
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[50px]">
            25
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[50px]">
            24
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[62px]">
            2 165
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[50px]">
            1
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[40px]">
            0
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[70px]">
            0,04
          </p>
          <div className="content-stretch flex h-[22px] items-center justify-end w-[62px]" data-name="Frame">
            <div className="bg-[#9bc53d] flex h-[20px] items-center justify-center px-[6px] rounded-[5px] w-[34px]" data-name="RatingChip">
              <p className="font-['Manrope:ExtraBold'] font-extrabold text-[11px] text-white">
                6,62
              </p>
            </div>
          </div>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[62px]">
            6,38
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[80px]">
            83 %
          </p>
          <div className="content-stretch flex gap-[10px] items-center justify-end w-[164px]" data-name="Frame">
            <Seg10Bar className="content-stretch flex gap-[2px] h-[6px] items-start w-[100px]" value="7" />
            <p className="font-['Changa:ExtraBold'] font-extrabold text-[#1b2a6b] text-[20px]">
              69
            </p>
          </div>
        </div>
        <div className="border-[#eef1f6] border-b border-solid flex gap-[6px] items-center py-[9px]" data-name="Frame">
          <p className="font-['Changa:ExtraBold'] font-extrabold h-[18px] text-[#1b2a6b] text-[16px] w-[30px]">
            7
          </p>
          <div className="content-stretch flex gap-[12px] items-center w-[240px]" data-name="Frame">
            <div className="content-stretch flex items-center justify-center rounded-[18px] size-[36px]" style={{ backgroundImage: "url(\"data:image/svg+xml;utf8,<svg viewBox='0 0 36 36' xmlns='http://www.w3.org/2000/svg' preserveAspectRatio='none'><rect x='0' y='0' height='100%' width='100%' fill='url(%23grad)' opacity='1'/><defs><radialGradient id='grad' gradientUnits='userSpaceOnUse' cx='0' cy='0' r='10' gradientTransform='matrix(1.8 0 0 1.8 18 28.8)'><stop stop-color='rgba(200,16,46,1)' offset='0'/><stop stop-color='rgba(153,15,42,1)' offset='0.25'/><stop stop-color='rgba(105,14,38,1)' offset='0.5'/><stop stop-color='rgba(58,14,34,1)' offset='0.75'/><stop stop-color='rgba(34,13,33,1)' offset='0.875'/><stop stop-color='rgba(10,13,31,1)' offset='1'/></radialGradient></defs></svg>\")" }} data-name="Headshot / placeholder">
              <p className="font-['Changa:ExtraBold'] font-extrabold text-[13px] text-white">
                YE
              </p>
              <div className="absolute left-[26px] size-[9px] top-[26px]" data-name="missing photo">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgMissingPhoto} />
              </div>
            </div>
            <div className="content-stretch flex flex-col gap-px items-start" data-name="Frame">
              <p className="font-['Manrope:ExtraBold'] font-extrabold text-[#0b1330] text-[14px]">
                Younes El Bahraoui
              </p>
              <p className="font-['Manrope:SemiBold'] font-semibold text-[#5d6789] text-[12px]">
                Kawkab Marrakech
              </p>
            </div>
          </div>
          <div className="content-stretch flex h-[22px] items-center w-[60px]" data-name="Frame">
            <div className="bg-[#e8ecfb] flex items-start px-[7px] py-[3px] rounded-[4px]" data-name="Frame">
              <p className="font-['IBM_Plex_Mono:SemiBold'] text-[#1b2a6b] text-[10px]">
                ATT
              </p>
            </div>
          </div>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[50px]">
            21
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[50px]">
            22
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[50px]">
            14
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[62px]">
            1 164
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[50px]">
            4
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[40px]">
            2
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[70px]">
            0,46
          </p>
          <div className="content-stretch flex h-[22px] items-center justify-end w-[62px]" data-name="Frame">
            <div className="bg-[#9bc53d] flex h-[20px] items-center justify-center px-[6px] rounded-[5px] w-[34px]" data-name="RatingChip">
              <p className="font-['Manrope:ExtraBold'] font-extrabold text-[11px] text-white">
                6,66
              </p>
            </div>
          </div>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[62px]">
            6,55
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[80px]">
            73 %
          </p>
          <div className="content-stretch flex gap-[10px] items-center justify-end w-[164px]" data-name="Frame">
            <Seg10Bar className="content-stretch flex gap-[2px] h-[6px] items-start w-[100px]" value="7" />
            <p className="font-['Changa:ExtraBold'] font-extrabold text-[#1b2a6b] text-[20px]">
              68
            </p>
          </div>
        </div>
        <div className="border-[#eef1f6] border-b border-solid flex gap-[6px] items-center py-[9px]" data-name="Frame">
          <p className="font-['Changa:ExtraBold'] font-extrabold h-[18px] text-[#1b2a6b] text-[16px] w-[30px]">
            8
          </p>
          <div className="content-stretch flex gap-[12px] items-center w-[240px]" data-name="Frame">
            <div className="content-stretch flex items-center justify-center rounded-[18px] size-[36px]" style={{ backgroundImage: "url(\"data:image/svg+xml;utf8,<svg viewBox='0 0 36 36' xmlns='http://www.w3.org/2000/svg' preserveAspectRatio='none'><rect x='0' y='0' height='100%' width='100%' fill='url(%23grad)' opacity='1'/><defs><radialGradient id='grad' gradientUnits='userSpaceOnUse' cx='0' cy='0' r='10' gradientTransform='matrix(1.8 0 0 1.8 18 28.8)'><stop stop-color='rgba(10,122,60,1)' offset='0'/><stop stop-color='rgba(10,95,53,1)' offset='0.25'/><stop stop-color='rgba(10,67,45,1)' offset='0.5'/><stop stop-color='rgba(10,40,38,1)' offset='0.75'/><stop stop-color='rgba(10,13,31,1)' offset='1'/></radialGradient></defs></svg>\")" }} data-name="Headshot / placeholder">
              <p className="font-['Changa:ExtraBold'] font-extrabold text-[13px] text-white">
                MO
              </p>
              <div className="absolute left-[26px] size-[9px] top-[26px]" data-name="missing photo">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgMissingPhoto} />
              </div>
            </div>
            <div className="content-stretch flex flex-col gap-px items-start" data-name="Frame">
              <p className="font-['Manrope:ExtraBold'] font-extrabold text-[#0b1330] text-[14px]">
                Marouane Oujeddou
              </p>
              <p className="font-['Manrope:SemiBold'] font-semibold text-[#5d6789] text-[12px]">
                CR Khemis Zemamra
              </p>
            </div>
          </div>
          <div className="content-stretch flex h-[22px] items-center w-[60px]" data-name="Frame">
            <div className="bg-[#e8ecfb] flex items-start px-[7px] py-[3px] rounded-[4px]" data-name="Frame">
              <p className="font-['IBM_Plex_Mono:SemiBold'] text-[#1b2a6b] text-[10px]">
                ATT
              </p>
            </div>
          </div>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[50px]">
            22
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[50px]">
            28
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[50px]">
            21
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[62px]">
            1 717
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[50px]">
            1
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[40px]">
            3
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[70px]">
            0,21
          </p>
          <div className="content-stretch flex h-[22px] items-center justify-end w-[62px]" data-name="Frame">
            <div className="bg-[#9bc53d] flex h-[20px] items-center justify-center px-[6px] rounded-[5px] w-[34px]" data-name="RatingChip">
              <p className="font-['Manrope:ExtraBold'] font-extrabold text-[11px] text-white">
                6,62
              </p>
            </div>
          </div>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[62px]">
            6,78
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[80px]">
            57 %
          </p>
          <div className="content-stretch flex gap-[10px] items-center justify-end w-[164px]" data-name="Frame">
            <Seg10Bar className="content-stretch flex gap-[2px] h-[6px] items-start w-[100px]" value="6" />
            <p className="font-['Changa:ExtraBold'] font-extrabold text-[#1b2a6b] text-[20px]">
              62
            </p>
          </div>
        </div>
        <div className="border-[#eef1f6] border-b border-solid flex gap-[6px] items-center py-[9px]" data-name="Frame">
          <p className="font-['Changa:ExtraBold'] font-extrabold h-[18px] text-[#1b2a6b] text-[16px] w-[30px]">
            9
          </p>
          <div className="content-stretch flex gap-[12px] items-center w-[240px]" data-name="Frame">
            <div className="content-stretch flex items-center justify-center rounded-[18px] size-[36px]" style={{ backgroundImage: "url(\"data:image/svg+xml;utf8,<svg viewBox='0 0 36 36' xmlns='http://www.w3.org/2000/svg' preserveAspectRatio='none'><rect x='0' y='0' height='100%' width='100%' fill='url(%23grad)' opacity='1'/><defs><radialGradient id='grad' gradientUnits='userSpaceOnUse' cx='0' cy='0' r='10' gradientTransform='matrix(1.8 0 0 1.8 18 28.8)'><stop stop-color='rgba(30,58,122,1)' offset='0'/><stop stop-color='rgba(20,35,76,1)' offset='0.5'/><stop stop-color='rgba(15,24,53,1)' offset='0.75'/><stop stop-color='rgba(10,13,31,1)' offset='1'/></radialGradient></defs></svg>\")" }} data-name="Headshot / placeholder">
              <p className="font-['Changa:ExtraBold'] font-extrabold text-[13px] text-white">
                HE
              </p>
              <div className="absolute left-[26px] size-[9px] top-[26px]" data-name="missing photo">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgMissingPhoto} />
              </div>
            </div>
            <div className="content-stretch flex flex-col gap-px items-start" data-name="Frame">
              <p className="font-['Manrope:ExtraBold'] font-extrabold text-[#0b1330] text-[14px]">
                Hossam Essadak
              </p>
              <p className="font-['Manrope:SemiBold'] font-semibold text-[#5d6789] text-[12px]">
                UTS Rabat
              </p>
            </div>
          </div>
          <div className="content-stretch flex h-[22px] items-center w-[60px]" data-name="Frame">
            <div className="bg-[#e8ecfb] flex items-start px-[7px] py-[3px] rounded-[4px]" data-name="Frame">
              <p className="font-['IBM_Plex_Mono:SemiBold'] text-[#1b2a6b] text-[10px]">
                MIL
              </p>
            </div>
          </div>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[50px]">
            21
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[50px]">
            13
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[50px]">
            11
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[62px]">
            843
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[50px]">
            0
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[40px]">
            2
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[70px]">
            0,21
          </p>
          <div className="content-stretch flex h-[22px] items-center justify-end w-[62px]" data-name="Frame">
            <div className="bg-[#9bc53d] flex h-[20px] items-center justify-center px-[6px] rounded-[5px] w-[34px]" data-name="RatingChip">
              <p className="font-['Manrope:ExtraBold'] font-extrabold text-[11px] text-white">
                6,65
              </p>
            </div>
          </div>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[62px]">
            6,70
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[80px]">
            69 %
          </p>
          <div className="content-stretch flex gap-[10px] items-center justify-end w-[164px]" data-name="Frame">
            <Seg10Bar className="content-stretch flex gap-[2px] h-[6px] items-start w-[100px]" value="6" />
            <p className="font-['Changa:ExtraBold'] font-extrabold text-[#1b2a6b] text-[20px]">
              56
            </p>
          </div>
        </div>
        <div className="border-[#eef1f6] border-b border-solid flex gap-[6px] items-center py-[9px]" data-name="Frame">
          <p className="font-['Changa:ExtraBold'] font-extrabold h-[18px] text-[#1b2a6b] text-[16px] w-[30px]">
            10
          </p>
          <div className="content-stretch flex gap-[12px] items-center w-[240px]" data-name="Frame">
            <div className="content-stretch flex items-center justify-center rounded-[18px] size-[36px]" style={{ backgroundImage: "url(\"data:image/svg+xml;utf8,<svg viewBox='0 0 36 36' xmlns='http://www.w3.org/2000/svg' preserveAspectRatio='none'><rect x='0' y='0' height='100%' width='100%' fill='url(%23grad)' opacity='1'/><defs><radialGradient id='grad' gradientUnits='userSpaceOnUse' cx='0' cy='0' r='10' gradientTransform='matrix(1.8 0 0 1.8 18 28.8)'><stop stop-color='rgba(30,58,122,1)' offset='0'/><stop stop-color='rgba(20,35,76,1)' offset='0.5'/><stop stop-color='rgba(15,24,53,1)' offset='0.75'/><stop stop-color='rgba(10,13,31,1)' offset='1'/></radialGradient></defs></svg>\")" }} data-name="Headshot / placeholder">
              <p className="font-['Changa:ExtraBold'] font-extrabold text-[13px] text-white">
                HB
              </p>
              <div className="absolute left-[26px] size-[9px] top-[26px]" data-name="missing photo">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgMissingPhoto} />
              </div>
            </div>
            <div className="content-stretch flex flex-col gap-px items-start" data-name="Frame">
              <p className="font-['Manrope:ExtraBold'] font-extrabold text-[#0b1330] text-[14px]">
                Houssam Bouelainine
              </p>
              <p className="font-['Manrope:SemiBold'] font-semibold text-[#5d6789] text-[12px]">
                UTS Rabat
              </p>
            </div>
          </div>
          <div className="content-stretch flex h-[22px] items-center w-[60px]" data-name="Frame">
            <div className="bg-[#e8ecfb] flex items-start px-[7px] py-[3px] rounded-[4px]" data-name="Frame">
              <p className="font-['IBM_Plex_Mono:SemiBold'] text-[#1b2a6b] text-[10px]">
                GB
              </p>
            </div>
          </div>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[50px]">
            21
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[50px]">
            16
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[50px]">
            16
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[62px]">
            1 432
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[50px]">
            0
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[40px]">
            0
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[70px]">
            0,00
          </p>
          <div className="content-stretch flex h-[22px] items-center justify-end w-[62px]" data-name="Frame">
            <div className="bg-[#9bc53d] flex h-[20px] items-center justify-center px-[6px] rounded-[5px] w-[34px]" data-name="RatingChip">
              <p className="font-['Manrope:ExtraBold'] font-extrabold text-[11px] text-white">
                6,57
              </p>
            </div>
          </div>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[62px]">
            6,40
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[80px]">
            94 %
          </p>
          <div className="content-stretch flex gap-[10px] items-center justify-end w-[164px]" data-name="Frame">
            <Seg10Bar className="content-stretch flex gap-[2px] h-[6px] items-start w-[100px]" value="6" />
            <p className="font-['Changa:ExtraBold'] font-extrabold text-[#1b2a6b] text-[20px]">
              55
            </p>
          </div>
        </div>
        <div className="border-[#eef1f6] border-b border-solid flex gap-[6px] items-center py-[9px]" data-name="Frame">
          <p className="font-['Changa:ExtraBold'] font-extrabold h-[18px] text-[#1b2a6b] text-[16px] w-[30px]">
            11
          </p>
          <div className="content-stretch flex gap-[12px] items-center w-[240px]" data-name="Frame">
            <div className="content-stretch flex items-center justify-center rounded-[18px] size-[36px]" style={{ backgroundImage: "url(\"data:image/svg+xml;utf8,<svg viewBox='0 0 36 36' xmlns='http://www.w3.org/2000/svg' preserveAspectRatio='none'><rect x='0' y='0' height='100%' width='100%' fill='url(%23grad)' opacity='1'/><defs><radialGradient id='grad' gradientUnits='userSpaceOnUse' cx='0' cy='0' r='10' gradientTransform='matrix(1.8 0 0 1.8 18 28.8)'><stop stop-color='rgba(10,143,58,1)' offset='0'/><stop stop-color='rgba(10,110,51,1)' offset='0.25'/><stop stop-color='rgba(10,78,44,1)' offset='0.5'/><stop stop-color='rgba(10,45,37,1)' offset='0.75'/><stop stop-color='rgba(10,29,34,1)' offset='0.875'/><stop stop-color='rgba(10,13,31,1)' offset='1'/></radialGradient></defs></svg>\")" }} data-name="Headshot / placeholder">
              <p className="font-['Changa:ExtraBold'] font-extrabold text-[13px] text-white">
                MD
              </p>
              <div className="absolute left-[26px] size-[9px] top-[26px]" data-name="missing photo">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgMissingPhoto} />
              </div>
            </div>
            <div className="content-stretch flex flex-col gap-px items-start" data-name="Frame">
              <p className="font-['Manrope:ExtraBold'] font-extrabold text-[#0b1330] text-[14px]">
                Mouad Dahak
              </p>
              <p className="font-['Manrope:SemiBold'] font-semibold text-[#5d6789] text-[12px]">
                Raja Casablanca
              </p>
            </div>
          </div>
          <div className="content-stretch flex h-[22px] items-center w-[60px]" data-name="Frame">
            <div className="bg-[#e8ecfb] flex items-start px-[7px] py-[3px] rounded-[4px]" data-name="Frame">
              <p className="font-['IBM_Plex_Mono:SemiBold'] text-[#1b2a6b] text-[10px]">
                ATT
              </p>
            </div>
          </div>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[50px]">
            21
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[50px]">
            21
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[50px]">
            4
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[62px]">
            721
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[50px]">
            0
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[40px]">
            1
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[70px]">
            0,12
          </p>
          <div className="content-stretch flex h-[22px] items-center justify-end w-[62px]" data-name="Frame">
            <div className="bg-[#9bc53d] flex h-[20px] items-center justify-center px-[6px] rounded-[5px] w-[34px]" data-name="RatingChip">
              <p className="font-['Manrope:ExtraBold'] font-extrabold text-[11px] text-white">
                6,84
              </p>
            </div>
          </div>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[62px]">
            6,92
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[80px]">
            68 %
          </p>
          <div className="content-stretch flex gap-[10px] items-center justify-end w-[164px]" data-name="Frame">
            <Seg10Bar className="content-stretch flex gap-[2px] h-[6px] items-start w-[100px]" />
            <p className="font-['Changa:ExtraBold'] font-extrabold text-[#1b2a6b] text-[20px]">
              54
            </p>
          </div>
        </div>
        <div className="border-[#eef1f6] border-b border-solid flex gap-[6px] items-center py-[9px]" data-name="Frame">
          <p className="font-['Changa:ExtraBold'] font-extrabold h-[18px] text-[#1b2a6b] text-[16px] w-[30px]">
            12
          </p>
          <div className="content-stretch flex gap-[12px] items-center w-[240px]" data-name="Frame">
            <div className="content-stretch flex items-center justify-center rounded-[18px] size-[36px]" style={{ backgroundImage: "url(\"data:image/svg+xml;utf8,<svg viewBox='0 0 36 36' xmlns='http://www.w3.org/2000/svg' preserveAspectRatio='none'><rect x='0' y='0' height='100%' width='100%' fill='url(%23grad)' opacity='1'/><defs><radialGradient id='grad' gradientUnits='userSpaceOnUse' cx='0' cy='0' r='10' gradientTransform='matrix(1.8 0 0 1.8 18 28.8)'><stop stop-color='rgba(242,169,0,1)' offset='0'/><stop stop-color='rgba(184,130,8,1)' offset='0.25'/><stop stop-color='rgba(126,91,15,1)' offset='0.5'/><stop stop-color='rgba(97,71,19,1)' offset='0.625'/><stop stop-color='rgba(68,52,23,1)' offset='0.75'/><stop stop-color='rgba(39,32,27,1)' offset='0.875'/><stop stop-color='rgba(25,23,29,1)' offset='0.9375'/><stop stop-color='rgba(10,13,31,1)' offset='1'/></radialGradient></defs></svg>\")" }} data-name="Headshot / placeholder">
              <p className="font-['Changa:ExtraBold'] font-extrabold text-[13px] text-white">
                AA
              </p>
              <div className="absolute left-[26px] size-[9px] top-[26px]" data-name="missing photo">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgMissingPhoto} />
              </div>
            </div>
            <div className="content-stretch flex flex-col gap-px items-start" data-name="Frame">
              <p className="font-['Manrope:ExtraBold'] font-extrabold text-[#0b1330] text-[14px]">
                A. Aboujemaa
              </p>
              <p className="font-['Manrope:SemiBold'] font-semibold text-[#5d6789] text-[12px]">
                Olympique Dcheïra
              </p>
            </div>
          </div>
          <div className="content-stretch flex h-[22px] items-center w-[60px]" data-name="Frame">
            <div className="bg-[#e8ecfb] flex items-start px-[7px] py-[3px] rounded-[4px]" data-name="Frame">
              <p className="font-['IBM_Plex_Mono:SemiBold'] text-[#1b2a6b] text-[10px]">
                DEF
              </p>
            </div>
          </div>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[50px]">
            21
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[50px]">
            23
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[50px]">
            22
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[62px]">
            1 995
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[50px]">
            0
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[40px]">
            1
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[70px]">
            0,05
          </p>
          <div className="content-stretch flex h-[22px] items-center justify-end w-[62px]" data-name="Frame">
            <div className="bg-[#f0a020] flex h-[20px] items-center justify-center px-[6px] rounded-[5px] w-[34px]" data-name="RatingChip">
              <p className="font-['Manrope:ExtraBold'] font-extrabold text-[11px] text-white">
                6,49
              </p>
            </div>
          </div>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[62px]">
            6,63
          </p>
          <p className="font-['Manrope:Bold'] font-bold h-[18px] text-[#0b1330] text-[13px] text-right w-[80px]">
            68 %
          </p>
          <div className="content-stretch flex gap-[10px] items-center justify-end w-[164px]" data-name="Frame">
            <Seg10Bar className="content-stretch flex gap-[2px] h-[6px] items-start w-[100px]" />
            <p className="font-['Changa:ExtraBold'] font-extrabold text-[#1b2a6b] text-[20px]">
              54
            </p>
          </div>
        </div>
      </div>
      <p className="absolute font-['Manrope:SemiBold'] font-semibold left-[120px] text-[#5d6789] text-[12px] top-[1265px]">
        Données : matchs Botola Pro 2025-26 (SportsMonks). Pourcentages et score calculés par BotolaGO Data. Pastille orange : photo manquante.
      </p>
    </div>
  );
}
