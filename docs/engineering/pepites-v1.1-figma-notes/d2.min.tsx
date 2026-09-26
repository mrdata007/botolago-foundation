const imgTrack = "https://www.figma.com/api/mcp/asset/3270e8d9-c8c1-4b9c-9714-214a338216b8.svg";
const imgValueArcSetEndingAngle90360Score100 = "https://www.figma.com/api/mcp/asset/4ee5f617-6fee-4427-a266-0303f601bd48.svg";
const imgCutoutMohamedElArouch = "https://www.figma.com/api/mcp/asset/9bcb26b3-eeff-4ee8-a11f-2ff63465bc70.png";
const imgNightBand = "https://www.figma.com/api/mcp/asset/6d202daa-ad9c-4e68-bca4-2da6e8f7e4af.svg";
const imgHeroGlowsMasked = "https://www.figma.com/api/mcp/asset/d5a17ee2-7300-4d8e-8203-aa2284199f95.svg";
const imgSeasonAvg660 = "https://www.figma.com/api/mcp/asset/23303890-40d5-4573-9d28-d6de7cd38167.svg";
const imgRatingLine = "https://www.figma.com/api/mcp/asset/e32a679b-720d-4bd1-9ba4-b35950bf5829.svg";
const imgEllipse = "https://www.figma.com/api/mcp/asset/fb378119-fadf-4c9d-9a8d-f2f357380da6.svg";
const imgEllipse1 = "https://www.figma.com/api/mcp/asset/9e3466fa-dc5d-4e72-a62d-21d1d6a86c67.svg";
const imgEllipse2 = "https://www.figma.com/api/mcp/asset/f15a5db7-dc09-49b2-8a5f-6af9ed0ca8c7.svg";
const imgEllipse3 = "https://www.figma.com/api/mcp/asset/49e28b92-fbb1-4328-ae22-30d4e35ec956.svg";

type RatingChipProps = {
  className?: string;
  band?: "r2 6–6.5";
};

function RatingChip({ className, band = "r2 6–6.5" }: RatingChipProps) {
  return (
    <div className={className || "bg-[#f0a020] flex h-[20px] items-center justify-center px-[6px] rounded-[5px] w-[34px]"}>
      <p className="font-['Manrope:ExtraBold'] font-extrabold text-[11px] text-white">
        6,3
      </p>
    </div>
  );
}

type ScoreRingProps = {
  className?: string;
  theme?: "dark";
};

function ScoreRing({ className, theme = "dark" }: ScoreRingProps) {
  return (
    <div className={className || "relative size-[72px]"}>
      <div className="absolute left-0 size-[72px] top-0" data-name="track">
        <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgTrack} />
      </div>
      <div className="absolute left-0 size-[72px] top-0" data-name="value arc (set endingAngle = -90° + 360°×score/100)">
        <div className="absolute inset-[0_0_0_2.45%]">
          <img alt="" className="block max-w-none size-full" src={imgValueArcSetEndingAngle90360Score100} />
        </div>
      </div>
      <p className="-translate-x-1/2 absolute font-['Changa:ExtraBold'] font-extrabold h-[28px] left-[36px] text-[26px] text-center text-white top-[16px] w-[72px]">
        70
      </p>
      <p className="-translate-x-1/2 absolute font-['IBM_Plex_Mono:SemiBold'] h-[10px] left-[36px] text-[#9aa4c7] text-[7px] text-center top-[46px] tracking-[0.98px] w-[72px]">
        RISING
      </p>
    </div>
  );
}

type ButtonProps = {
  className?: string;
  kind?: "primary" | "ghost-dark";
};

function Button({ className, kind = "primary" }: ButtonProps) {
  const isGhostDark = kind === "ghost-dark";
  return (
    <div className={className || `content-stretch flex h-[38px] items-center justify-center px-[18px] rounded-[999px] w-[120px] ${isGhostDark ? "bg-[rgba(255,255,255,0.08)] border border-[rgba(255,255,255,0.2)] border-solid" : "bg-gradient-to-b from-[#7df0ac] to-[#8fe3f2]"}`} id={isGhostDark ? "node-3_269" : "node-3_265"}>
      <p className={`font-["Manrope:ExtraBold"] font-extrabold text-[13px] ${isGhostDark ? "text-white" : "text-[#0d1f4a]"}`} id={isGhostDark ? "node-3_270" : "node-3_266"}>
        {isGhostDark ? "Partager" : "＋ Suivre"}
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

function CutoutMohamedElArouch({ className }: { className?: string }) {
  return (
    <div className={className || "relative shadow-[0px_10px_16px_0px_rgba(0,0,0,0.5)] size-[150px]"} data-name="Cutout / Mohamed El Arouch">
      <img alt="" className="absolute inset-0 max-w-none object-contain pointer-events-none size-full" src={imgCutoutMohamedElArouch} />
    </div>
  );
}

export default function D2JoueurMohamedElArouchDesktopFr() {
  return (
    <div className="bg-[#f3f5fa] size-full" data-name="D2 · Joueur — Mohamed El Arouch (desktop FR)">
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
      <div className="absolute h-[412px] left-0 top-[64px] w-[1440px]" data-name="Night band">
        <div className="absolute inset-[-0.12%_0]">
          <img alt="" className="block max-w-none size-full" src={imgNightBand} />
        </div>
      </div>
      <div className="absolute h-[412px] left-0 top-[64px] w-[1440px]" data-name="Hero glows (masked)">
        <div className="absolute inset-[-0.12%_0]">
          <img alt="" className="block max-w-none size-full" src={imgHeroGlowsMasked} />
        </div>
      </div>
      <div className="absolute flex h-[802.177px] items-center justify-center left-[607.7px] top-[-10px] w-[669.305px]">
        <div className="flex-none scale-y-99 skew-x-[-7.97deg]">
          <p className="font-['Changa:ExtraBold'] font-extrabold text-[440px] text-[transparent]">05</p>
        </div>
      </div>
      <p className="absolute font-['Manrope:Bold'] font-bold left-[120px] text-[#9aa4c7] text-[12px] top-[88px] whitespace-pre">{`Pépites  ›  Classement  ›  Mohamed El Arouch`}</p>
      <CutoutMohamedElArouch className="absolute left-[112px] shadow-[0px_10px_16px_0px_rgba(0,0,0,0.5)] size-[290px] top-[112px]" />
      <div className="absolute flex h-[5.942px] items-center justify-center left-[131.17px] top-[404px] w-[250.832px]">
        <div className="flex-none scale-y-99 skew-x-[-7.97deg]">
          <div className="bg-gradient-to-r from-[#5de39b] h-[6px] to-[#7c6cf0] via-[#7fd6f0] via-[45%] w-[250px]" data-name="energy stripe" />
        </div>
      </div>
      <GoMarkPepitesData className="absolute flex gap-[6px] items-center left-[450px] top-[128px]" />
      <p className="absolute font-['IBM_Plex_Mono:SemiBold'] left-[450px] text-[#5de39b] text-[11px] top-[166px] tracking-[0.88px] whitespace-pre">{`N°5  ·  RISING SCORE  ·  U23`}</p>
      <div className="absolute flex h-[119.831px] items-center justify-center left-[435.22px] top-[180px] w-[615.776px]">
        <div className="flex-none scale-y-99 skew-x-[-7.97deg]">
          <p className="font-['Changa:ExtraBold'] font-extrabold text-[66px] text-white">Mohamed El Arouch</p>
        </div>
      </div>
      <p className="absolute font-['Manrope:Bold'] font-bold leading-[0] left-[450px] text-[#c9d2ea] text-[15px] top-[274px]">
        <span className="leading-[normal]">{`Ittihad Tanger · Défenseur · 22 ans · #5 · Pied : `}</span>
        <span className="leading-[normal] text-[#ffb020]">non renseigné</span>
      </p>
      <div className="absolute flex gap-[10px] items-start left-[450px] top-[312px]" data-name="Actions">
        <Button className="bg-gradient-to-b flex from-[#7df0ac] h-[38px] items-center justify-center px-[18px] rounded-[999px] to-[#8fe3f2] w-[120px]" />
        <div className="bg-[rgba(255,255,255,0.08)] border border-[rgba(255,255,255,0.2)] border-solid flex h-[38px] items-center justify-center px-[18px] rounded-[999px] w-[120px]" data-name="Button">
          <p className="font-['Manrope:ExtraBold'] font-extrabold text-[13px] text-white">
            ⇄ Comparer
          </p>
        </div>
        <div className="bg-[rgba(255,255,255,0.08)] border border-[rgba(255,255,255,0.2)] border-solid flex h-[38px] items-center justify-center px-[18px] rounded-[999px] w-[120px]" data-name="Button">
          <p className="font-['Manrope:ExtraBold'] font-extrabold text-[13px] text-white">
            ＋ Fantasy
          </p>
        </div>
        <Button className="bg-[rgba(255,255,255,0.08)] border border-[rgba(255,255,255,0.2)] border-solid flex h-[38px] items-center justify-center px-[18px] rounded-[999px] w-[120px]" kind="ghost-dark" />
      </div>
      <ScoreRing className="absolute left-[1170px] size-[150px] top-[112px]" />
      <div className="absolute flex flex-col gap-[2px] items-center left-[1156px] top-[272px]" data-name="Rank block">
        <p className="font-['Manrope:ExtraBold'] font-extrabold text-[16px] text-white">
          N°5 sur 27
        </p>
        <p className="font-['IBM_Plex_Mono:Medium'] text-[#9aa4c7] text-[10px] tracking-[0.6px]">
          MAJ LUN. 20:00 · ÉDITION S1
        </p>
      </div>
      <div className="absolute flex gap-[12px] items-start left-[450px] top-[366px]" data-name="KPI strip">
        <div className="bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.14)] border-solid flex flex-col gap-[2px] items-start px-[16px] py-[12px] rounded-[14px] w-[150px]" data-name="KPI NOTE MOYENNE">
          <p className="font-['Changa:ExtraBold'] font-extrabold text-[28px] text-white">
            6,60
          </p>
          <p className="font-['IBM_Plex_Mono:Medium'] text-[#9aa4c7] text-[9px] tracking-[0.72px]">
            NOTE MOYENNE
          </p>
        </div>
        <div className="bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.14)] border-solid flex flex-col gap-[2px] items-start px-[16px] py-[12px] rounded-[14px] w-[150px]" data-name="KPI MINUTES">
          <p className="font-['Changa:ExtraBold'] font-extrabold text-[28px] text-white">
            1 159
          </p>
          <p className="font-['IBM_Plex_Mono:Medium'] text-[#9aa4c7] text-[9px] tracking-[0.72px]">
            MINUTES
          </p>
        </div>
        <div className="bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.14)] border-solid flex flex-col gap-[2px] items-start px-[16px] py-[12px] rounded-[14px] w-[150px]" data-name="KPI MATCHS">
          <p className="font-['Changa:ExtraBold'] font-extrabold text-[28px] text-white">
            17
          </p>
          <p className="font-['IBM_Plex_Mono:Medium'] text-[#9aa4c7] text-[9px] tracking-[0.72px]">
            MATCHS
          </p>
        </div>
        <div className="bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.14)] border-solid flex flex-col gap-[2px] items-start px-[16px] py-[12px] rounded-[14px] w-[150px]" data-name="KPI TITULARISATIONS">
          <p className="font-['Changa:ExtraBold'] font-extrabold text-[28px] text-white">
            15
          </p>
          <p className="font-['IBM_Plex_Mono:Medium'] text-[#9aa4c7] text-[9px] tracking-[0.72px]">
            TITULARISATIONS
          </p>
        </div>
        <div className="bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.14)] border-solid flex flex-col gap-[2px] items-start px-[16px] py-[12px] rounded-[14px] w-[150px]" data-name="KPI BUTS + PD">
          <p className="font-['Changa:ExtraBold'] font-extrabold text-[28px] text-white">
            1 + 1
          </p>
          <p className="font-['IBM_Plex_Mono:Medium'] text-[#9aa4c7] text-[9px] tracking-[0.72px]">
            BUTS + PD
          </p>
        </div>
      </div>
      <div className="absolute flex gap-[32px] items-start left-[120px] top-[496px]" data-name="Tabs">
        <div className="content-stretch flex flex-col gap-[6px] items-start" data-name="Frame">
          <p className="font-['Manrope:ExtraBold'] font-extrabold text-[#1b2a6b] text-[15px]">
            Aperçu
          </p>
          <div className="bg-gradient-to-r from-[#5de39b] h-[3px] to-[#7c6cf0] via-[#7fd6f0] via-[45%] w-[56px]" data-name="Rectangle" />
        </div>
        <div className="content-stretch flex flex-col items-start" data-name="Frame">
          <p className="font-['Manrope:ExtraBold'] font-extrabold text-[#5d6789] text-[15px]">
            Matchs
          </p>
        </div>
        <div className="content-stretch flex flex-col items-start" data-name="Frame">
          <p className="font-['Manrope:ExtraBold'] font-extrabold text-[#5d6789] text-[15px]">
            Stats
          </p>
        </div>
        <div className="content-stretch flex flex-col items-start" data-name="Frame">
          <p className="font-['Manrope:ExtraBold'] font-extrabold text-[#5d6789] text-[15px]">
            Comparer
          </p>
        </div>
      </div>
      <div className="absolute bg-[#dfe3ee] h-px left-[120px] top-[526px] w-[1200px]" data-name="tabs rule" />
      <div className="absolute flex flex-col gap-[20px] items-start left-[120px] top-[554px]" data-name="Left column">
        <div className="bg-white flex flex-col gap-[14px] items-start px-[24px] py-[22px] rounded-[18px] shadow-[0px_8px_24px_0px_rgba(11,19,48,0.07)] w-[776px]" data-name="Percentiles">
          <div className="content-stretch flex items-center justify-between w-full" data-name="head">
            <p className="font-['IBM_Plex_Mono:SemiBold'] text-[#0b1330] text-[12px] tracking-[0.72px]">
              PERCENTILES · SAISON 2025-26
            </p>
            <p className="font-['IBM_Plex_Mono:Medium'] text-[#5d6789] text-[11px]">
              comparé aux 26 autres joueurs U23 classés
            </p>
          </div>
          <div className="content-stretch flex gap-[20px] items-center w-full" data-name="Row Note moyenne">
            <div className="content-stretch flex flex-col gap-px items-start w-[230px]" data-name="Frame">
              <p className="font-['Manrope:ExtraBold'] font-extrabold text-[#0b1330] text-[14px]">
                Note moyenne
              </p>
              <p className="font-['Manrope:Bold'] font-bold text-[#5d6789] text-[11px]">
                6,60 sur la saison
              </p>
            </div>
            <div className="content-stretch flex gap-[4px] items-start" data-name="Seg10 65">
              <div className="bg-[#5de39b] h-[12px] rounded-[3px] w-[38px]" data-name="Rectangle" />
              <div className="bg-[#65e0b0] h-[12px] rounded-[3px] w-[38px]" data-name="Rectangle" />
              <div className="bg-[#6eddc5] h-[12px] rounded-[3px] w-[38px]" data-name="Rectangle" />
              <div className="bg-[#76d9da] h-[12px] rounded-[3px] w-[38px]" data-name="Rectangle" />
              <div className="bg-[#7fd6ef] h-[12px] rounded-[3px] w-[38px]" data-name="Rectangle" />
              <div className="bg-[#7ec2f0] h-[12px] rounded-[3px] w-[38px]" data-name="Rectangle" />
              <div className="bg-[#7eacf0] h-[12px] rounded-[3px] w-[38px]" data-name="Rectangle" />
              <div className="bg-[#e6e9f2] h-[12px] rounded-[3px] w-[38px]" data-name="Rectangle" />
              <div className="bg-[#e6e9f2] h-[12px] rounded-[3px] w-[38px]" data-name="Rectangle" />
              <div className="bg-[#e6e9f2] h-[12px] rounded-[3px] w-[38px]" data-name="Rectangle" />
            </div>
            <p className="font-['Changa:ExtraBold'] font-extrabold text-[#1b2a6b] text-[26px] text-right w-[44px]">
              65
            </p>
          </div>
          <div className="content-stretch flex gap-[20px] items-center w-full" data-name="Row Forme">
            <div className="content-stretch flex flex-col gap-px items-start w-[230px]" data-name="Frame">
              <p className="font-['Manrope:ExtraBold'] font-extrabold text-[#0b1330] text-[14px]">
                Forme
              </p>
              <p className="font-['Manrope:Bold'] font-bold text-[#5d6789] text-[11px]">
                6,72 sur les 6 derniers matchs
              </p>
            </div>
            <div className="content-stretch flex gap-[4px] items-start" data-name="Seg10 77">
              <div className="bg-[#5de39b] h-[12px] rounded-[3px] w-[38px]" data-name="Rectangle" />
              <div className="bg-[#65e0b0] h-[12px] rounded-[3px] w-[38px]" data-name="Rectangle" />
              <div className="bg-[#6eddc5] h-[12px] rounded-[3px] w-[38px]" data-name="Rectangle" />
              <div className="bg-[#76d9da] h-[12px] rounded-[3px] w-[38px]" data-name="Rectangle" />
              <div className="bg-[#7fd6ef] h-[12px] rounded-[3px] w-[38px]" data-name="Rectangle" />
              <div className="bg-[#7ec2f0] h-[12px] rounded-[3px] w-[38px]" data-name="Rectangle" />
              <div className="bg-[#7eacf0] h-[12px] rounded-[3px] w-[38px]" data-name="Rectangle" />
              <div className="bg-[#7d97f0] h-[12px] rounded-[3px] w-[38px]" data-name="Rectangle" />
              <div className="bg-[#e6e9f2] h-[12px] rounded-[3px] w-[38px]" data-name="Rectangle" />
              <div className="bg-[#e6e9f2] h-[12px] rounded-[3px] w-[38px]" data-name="Rectangle" />
            </div>
            <p className="font-['Changa:ExtraBold'] font-extrabold text-[#1b2a6b] text-[26px] text-right w-[44px]">
              77
            </p>
          </div>
          <div className="content-stretch flex gap-[20px] items-center w-full" data-name="Row Contribution">
            <div className="content-stretch flex flex-col gap-px items-start w-[230px]" data-name="Frame">
              <p className="font-['Manrope:ExtraBold'] font-extrabold text-[#0b1330] text-[14px]">
                Contribution
              </p>
              <p className="font-['Manrope:Bold'] font-bold text-[#5d6789] text-[11px]">
                défenseur : clean sheets et note
              </p>
            </div>
            <div className="content-stretch flex gap-[4px] items-start" data-name="Seg10 90">
              <div className="bg-[#5de39b] h-[12px] rounded-[3px] w-[38px]" data-name="Rectangle" />
              <div className="bg-[#65e0b0] h-[12px] rounded-[3px] w-[38px]" data-name="Rectangle" />
              <div className="bg-[#6eddc5] h-[12px] rounded-[3px] w-[38px]" data-name="Rectangle" />
              <div className="bg-[#76d9da] h-[12px] rounded-[3px] w-[38px]" data-name="Rectangle" />
              <div className="bg-[#7fd6ef] h-[12px] rounded-[3px] w-[38px]" data-name="Rectangle" />
              <div className="bg-[#7ec2f0] h-[12px] rounded-[3px] w-[38px]" data-name="Rectangle" />
              <div className="bg-[#7eacf0] h-[12px] rounded-[3px] w-[38px]" data-name="Rectangle" />
              <div className="bg-[#7d97f0] h-[12px] rounded-[3px] w-[38px]" data-name="Rectangle" />
              <div className="bg-[#7d81f0] h-[12px] rounded-[3px] w-[38px]" data-name="Rectangle" />
              <div className="bg-[#e6e9f2] h-[12px] rounded-[3px] w-[38px]" data-name="Rectangle" />
            </div>
            <p className="font-['Changa:ExtraBold'] font-extrabold text-[#1b2a6b] text-[26px] text-right w-[44px]">
              90
            </p>
          </div>
          <div className="content-stretch flex gap-[20px] items-center w-full" data-name="Row Progression">
            <div className="content-stretch flex flex-col gap-px items-start w-[230px]" data-name="Frame">
              <p className="font-['Manrope:ExtraBold'] font-extrabold text-[#0b1330] text-[14px]">
                Progression
              </p>
              <p className="font-['Manrope:Bold'] font-bold text-[#5d6789] text-[11px]">
                155′ → 1 004′ entre les deux moitiés
              </p>
            </div>
            <div className="content-stretch flex gap-[4px] items-start" data-name="Seg10 62">
              <div className="bg-[#5de39b] h-[12px] rounded-[3px] w-[38px]" data-name="Rectangle" />
              <div className="bg-[#65e0b0] h-[12px] rounded-[3px] w-[38px]" data-name="Rectangle" />
              <div className="bg-[#6eddc5] h-[12px] rounded-[3px] w-[38px]" data-name="Rectangle" />
              <div className="bg-[#76d9da] h-[12px] rounded-[3px] w-[38px]" data-name="Rectangle" />
              <div className="bg-[#7fd6ef] h-[12px] rounded-[3px] w-[38px]" data-name="Rectangle" />
              <div className="bg-[#7ec2f0] h-[12px] rounded-[3px] w-[38px]" data-name="Rectangle" />
              <div className="bg-[#e6e9f2] h-[12px] rounded-[3px] w-[38px]" data-name="Rectangle" />
              <div className="bg-[#e6e9f2] h-[12px] rounded-[3px] w-[38px]" data-name="Rectangle" />
              <div className="bg-[#e6e9f2] h-[12px] rounded-[3px] w-[38px]" data-name="Rectangle" />
              <div className="bg-[#e6e9f2] h-[12px] rounded-[3px] w-[38px]" data-name="Rectangle" />
            </div>
            <p className="font-['Changa:ExtraBold'] font-extrabold text-[#1b2a6b] text-[26px] text-right w-[44px]">
              62
            </p>
          </div>
          <div className="content-stretch flex gap-[20px] items-center w-full" data-name="Row Temps de jeu">
            <div className="content-stretch flex flex-col gap-px items-start w-[230px]" data-name="Frame">
              <p className="font-['Manrope:ExtraBold'] font-extrabold text-[#0b1330] text-[14px]">
                Temps de jeu
              </p>
              <p className="font-['Manrope:Bold'] font-bold text-[#5d6789] text-[11px]">
                1 159 minutes, 15 titularisations
              </p>
            </div>
            <div className="content-stretch flex gap-[4px] items-start" data-name="Seg10 50">
              <div className="bg-[#5de39b] h-[12px] rounded-[3px] w-[38px]" data-name="Rectangle" />
              <div className="bg-[#65e0b0] h-[12px] rounded-[3px] w-[38px]" data-name="Rectangle" />
              <div className="bg-[#6eddc5] h-[12px] rounded-[3px] w-[38px]" data-name="Rectangle" />
              <div className="bg-[#76d9da] h-[12px] rounded-[3px] w-[38px]" data-name="Rectangle" />
              <div className="bg-[#7fd6ef] h-[12px] rounded-[3px] w-[38px]" data-name="Rectangle" />
              <div className="bg-[#e6e9f2] h-[12px] rounded-[3px] w-[38px]" data-name="Rectangle" />
              <div className="bg-[#e6e9f2] h-[12px] rounded-[3px] w-[38px]" data-name="Rectangle" />
              <div className="bg-[#e6e9f2] h-[12px] rounded-[3px] w-[38px]" data-name="Rectangle" />
              <div className="bg-[#e6e9f2] h-[12px] rounded-[3px] w-[38px]" data-name="Rectangle" />
              <div className="bg-[#e6e9f2] h-[12px] rounded-[3px] w-[38px]" data-name="Rectangle" />
            </div>
            <p className="font-['Changa:ExtraBold'] font-extrabold text-[#1b2a6b] text-[26px] text-right w-[44px]">
              50
            </p>
          </div>
        </div>
        <div className="bg-white flex flex-col gap-[14px] items-start px-[24px] py-[22px] rounded-[18px] shadow-[0px_8px_24px_0px_rgba(11,19,48,0.07)] w-[776px]" data-name="Rating trend">
          <div className="content-stretch flex items-center justify-between w-full" data-name="head">
            <p className="font-['IBM_Plex_Mono:SemiBold'] text-[#0b1330] text-[12px] tracking-[0.72px]">
              NOTE · 10 DERNIERS MATCHS
            </p>
            <p className="font-['IBM_Plex_Mono:Medium'] text-[#5d6789] text-[11px]">
              moy. saison 6,60
            </p>
          </div>
          <div className="h-[200px] w-[728px]" data-name="chart">
            <div className="absolute bg-[#eef0f6] h-px left-[40px] top-[140px] w-[680px]" data-name="Rectangle" />
            <p className="absolute font-['IBM_Plex_Mono:Medium'] left-0 text-[#9aa4c7] text-[10px] top-[133px]">
              6,0
            </p>
            <div className="absolute bg-[#eef0f6] h-px left-[40px] top-[80px] w-[680px]" data-name="Rectangle" />
            <p className="absolute font-['IBM_Plex_Mono:Medium'] left-0 text-[#9aa4c7] text-[10px] top-[73px]">
              7,0
            </p>
            <div className="absolute bg-[#eef0f6] h-px left-[40px] top-[20px] w-[680px]" data-name="Rectangle" />
            <p className="absolute font-['IBM_Plex_Mono:Medium'] left-0 text-[#9aa4c7] text-[10px] top-[13px]">
              8,0
            </p>
            <div className="absolute h-0 left-[40px] top-[104px] w-[680px]" data-name="season avg 6,60">
              <div className="absolute inset-[-0.75px_0]">
                <img alt="" className="block max-w-none size-full" src={imgSeasonAvg660} />
              </div>
            </div>
            <div className="absolute h-[90px] left-[52px] top-[44px] w-[660px]" data-name="rating line">
              <div className="absolute inset-[-1.67%_-0.23%]">
                <img alt="" className="block max-w-none size-full" src={imgRatingLine} />
              </div>
            </div>
            <div className="absolute left-[45px] size-[14px] top-[103px]" data-name="Ellipse">
              <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgEllipse} />
            </div>
            <p className="absolute font-['IBM_Plex_Mono:SemiBold'] left-[43px] text-[#0b1330] text-[10px] top-[86px]">
              6,5
            </p>
            <p className="absolute font-['IBM_Plex_Mono:Medium'] left-[37px] text-[#5d6789] text-[10px] top-[182px]">
              25.04
            </p>
            <div className="absolute left-[118.33px] size-[14px] top-[127px]" data-name="Ellipse">
              <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgEllipse1} />
            </div>
            <p className="absolute font-['IBM_Plex_Mono:SemiBold'] left-[116.33px] text-[#0b1330] text-[10px] top-[110px]">
              6,1
            </p>
            <p className="absolute font-['IBM_Plex_Mono:Medium'] left-[110.33px] text-[#5d6789] text-[10px] top-[182px]">
              29.04
            </p>
            <div className="absolute left-[191.67px] size-[14px] top-[127px]" data-name="Ellipse">
              <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgEllipse1} />
            </div>
            <p className="absolute font-['IBM_Plex_Mono:SemiBold'] left-[189.67px] text-[#0b1330] text-[10px] top-[110px]">
              6,1
            </p>
            <p className="absolute font-['IBM_Plex_Mono:Medium'] left-[183.67px] text-[#5d6789] text-[10px] top-[182px]">
              06.05
            </p>
            <div className="absolute left-[265px] size-[14px] top-[37px]" data-name="Ellipse">
              <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgEllipse2} />
            </div>
            <p className="absolute font-['IBM_Plex_Mono:SemiBold'] left-[263px] text-[#0b1330] text-[10px] top-[20px]">
              7,6
            </p>
            <p className="absolute font-['IBM_Plex_Mono:Medium'] left-[257px] text-[#5d6789] text-[10px] top-[182px]">
              10.05
            </p>
            <div className="absolute left-[338.33px] size-[14px] top-[73px]" data-name="Ellipse">
              <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgEllipse3} />
            </div>
            <p className="absolute font-['IBM_Plex_Mono:SemiBold'] left-[336.33px] text-[#0b1330] text-[10px] top-[56px]">
              7,0
            </p>
            <p className="absolute font-['IBM_Plex_Mono:Medium'] left-[330.33px] text-[#5d6789] text-[10px] top-[182px]">
              22.05
            </p>
            <div className="absolute left-[411.67px] size-[14px] top-[55px]" data-name="Ellipse">
              <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgEllipse3} />
            </div>
            <p className="absolute font-['IBM_Plex_Mono:SemiBold'] left-[409.67px] text-[#0b1330] text-[10px] top-[38px]">
              7,3
            </p>
            <p className="absolute font-['IBM_Plex_Mono:Medium'] left-[403.67px] text-[#5d6789] text-[10px] top-[182px]">
              03.06
            </p>
            <div className="absolute left-[485px] size-[14px] top-[85px]" data-name="Ellipse">
              <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgEllipse} />
            </div>
            <p className="absolute font-['IBM_Plex_Mono:SemiBold'] left-[483px] text-[#0b1330] text-[10px] top-[68px]">
              6,8
            </p>
            <p className="absolute font-['IBM_Plex_Mono:Medium'] left-[477px] text-[#5d6789] text-[10px] top-[182px]">
              08.06
            </p>
            <div className="absolute left-[558.33px] size-[14px] top-[115px]" data-name="Ellipse">
              <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgEllipse1} />
            </div>
            <p className="absolute font-['IBM_Plex_Mono:SemiBold'] left-[556.33px] text-[#0b1330] text-[10px] top-[98px]">
              6,3
            </p>
            <p className="absolute font-['IBM_Plex_Mono:Medium'] left-[550.33px] text-[#5d6789] text-[10px] top-[182px]">
              14.06
            </p>
            <div className="absolute left-[631.67px] size-[14px] top-[109px]" data-name="Ellipse">
              <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgEllipse1} />
            </div>
            <p className="absolute font-['IBM_Plex_Mono:SemiBold'] left-[629.67px] text-[#0b1330] text-[10px] top-[92px]">
              6,4
            </p>
            <p className="absolute font-['IBM_Plex_Mono:Medium'] left-[623.67px] text-[#5d6789] text-[10px] top-[182px]">
              28.06
            </p>
            <div className="absolute left-[705px] size-[14px] top-[103px]" data-name="Ellipse">
              <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgEllipse} />
            </div>
            <p className="absolute font-['IBM_Plex_Mono:SemiBold'] left-[703px] text-[#0b1330] text-[10px] top-[86px]">
              6,5
            </p>
            <p className="absolute font-['IBM_Plex_Mono:Medium'] left-[697px] text-[#5d6789] text-[10px] top-[182px]">
              05.07
            </p>
          </div>
        </div>
        <div className="bg-white flex flex-col items-start px-[24px] py-[22px] rounded-[18px] shadow-[0px_8px_24px_0px_rgba(11,19,48,0.07)] w-[776px]" data-name="Match log">
          <div className="content-stretch flex items-center justify-between w-full" data-name="head">
            <p className="font-['IBM_Plex_Mono:SemiBold'] text-[#0b1330] text-[12px] tracking-[0.72px]">
              MATCHS · SAISON 2025-26
            </p>
            <p className="font-['IBM_Plex_Mono:Medium'] text-[#5d6789] text-[11px]">
              10 derniers sur 17
            </p>
          </div>
          <div className="font-['IBM_Plex_Mono:Medium'] h-[40px] text-[#5d6789] text-[10px] tracking-[0.6px] w-[728px]" data-name="header">
            <p className="absolute left-0 top-[18px]">
              DATE
            </p>
            <p className="absolute left-[80px] top-[18px]">
              ADVERSAIRE
            </p>
            <p className="absolute left-[330px] top-[18px]">
              LIEU
            </p>
            <p className="absolute left-[420px] top-[18px]">
              SCORE
            </p>
            <p className="absolute left-[538px] top-[18px]">
              MIN
            </p>
            <p className="absolute left-[599px] top-[18px]">
              B / PD
            </p>
            <p className="absolute left-[702px] top-[18px]">
              NOTE
            </p>
          </div>
          <div className="h-[44px] w-[728px]" data-name="row 05.07">
            <div className="absolute bg-[#eef0f6] h-px left-0 top-0 w-[728px]" data-name="Rectangle" />
            <p className="absolute font-['IBM_Plex_Mono:Medium'] left-0 text-[#5d6789] text-[12px] top-[14px]">
              05.07
            </p>
            <p className="absolute font-['Manrope:ExtraBold'] font-extrabold left-[80px] text-[#0b1330] text-[13px] top-[13px]">
              CODM Meknès
            </p>
            <p className="absolute font-['Manrope:Bold'] font-bold left-[330px] text-[#5d6789] text-[12px] top-[14px]">
              Domicile
            </p>
            <p className="absolute font-['IBM_Plex_Mono:SemiBold'] left-[420px] text-[#0b1330] text-[13px] top-[13px]">
              2-1
            </p>
            <p className="absolute font-['IBM_Plex_Mono:SemiBold'] left-[534px] text-[#0b1330] text-[13px] top-[13px]">
              40′
            </p>
            <p className="absolute font-['IBM_Plex_Mono:SemiBold'] left-[630px] text-[#9aa4c7] text-[13px] top-[13px]">
              –
            </p>
            <div className="absolute bg-[#9bc53d] flex h-[20px] items-center justify-center left-[694px] px-[6px] rounded-[5px] top-[12px] w-[34px]" data-name="RatingChip">
              <p className="font-['Manrope:ExtraBold'] font-extrabold text-[11px] text-white">
                6,5
              </p>
            </div>
          </div>
          <div className="h-[44px] w-[728px]" data-name="row 28.06">
            <div className="absolute bg-[#eef0f6] h-px left-0 top-0 w-[728px]" data-name="Rectangle" />
            <p className="absolute font-['IBM_Plex_Mono:Medium'] left-0 text-[#5d6789] text-[12px] top-[14px]">
              28.06
            </p>
            <p className="absolute font-['Manrope:ExtraBold'] font-extrabold left-[80px] text-[#0b1330] text-[13px] top-[13px]">
              Raja Casablanca
            </p>
            <p className="absolute font-['Manrope:Bold'] font-bold left-[330px] text-[#5d6789] text-[12px] top-[14px]">
              Domicile
            </p>
            <p className="absolute font-['IBM_Plex_Mono:SemiBold'] left-[420px] text-[#0b1330] text-[13px] top-[13px]">
              1-1
            </p>
            <p className="absolute font-['IBM_Plex_Mono:SemiBold'] left-[534px] text-[#0b1330] text-[13px] top-[13px]">
              90′
            </p>
            <p className="absolute font-['IBM_Plex_Mono:SemiBold'] left-[606px] text-[#27b36b] text-[13px] top-[13px]">
              1 PD
            </p>
            <div className="absolute bg-[#f0a020] flex h-[20px] items-center justify-center left-[694px] px-[6px] rounded-[5px] top-[12px] w-[34px]" data-name="RatingChip">
              <p className="font-['Manrope:ExtraBold'] font-extrabold text-[11px] text-white">
                6,4
              </p>
            </div>
          </div>
          <div className="h-[44px] w-[728px]" data-name="row 14.06">
            <div className="absolute bg-[#eef0f6] h-px left-0 top-0 w-[728px]" data-name="Rectangle" />
            <p className="absolute font-['IBM_Plex_Mono:Medium'] left-0 text-[#5d6789] text-[12px] top-[14px]">
              14.06
            </p>
            <p className="absolute font-['Manrope:ExtraBold'] font-extrabold left-[80px] text-[#0b1330] text-[13px] top-[13px]">
              Y. El Mansour
            </p>
            <p className="absolute font-['Manrope:Bold'] font-bold left-[330px] text-[#5d6789] text-[12px] top-[14px]">
              Domicile
            </p>
            <p className="absolute font-['IBM_Plex_Mono:SemiBold'] left-[420px] text-[#0b1330] text-[13px] top-[13px]">
              2-1
            </p>
            <p className="absolute font-['IBM_Plex_Mono:SemiBold'] left-[534px] text-[#0b1330] text-[13px] top-[13px]">
              77′
            </p>
            <p className="absolute font-['IBM_Plex_Mono:SemiBold'] left-[630px] text-[#9aa4c7] text-[13px] top-[13px]">
              –
            </p>
            <RatingChip className="absolute bg-[#f0a020] flex h-[20px] items-center justify-center left-[694px] px-[6px] rounded-[5px] top-[12px] w-[34px]" />
          </div>
          <div className="h-[44px] w-[728px]" data-name="row 08.06">
            <div className="absolute bg-[#eef0f6] h-px left-0 top-0 w-[728px]" data-name="Rectangle" />
            <p className="absolute font-['IBM_Plex_Mono:Medium'] left-0 text-[#5d6789] text-[12px] top-[14px]">
              08.06
            </p>
            <p className="absolute font-['Manrope:ExtraBold'] font-extrabold left-[80px] text-[#0b1330] text-[13px] top-[13px]">
              RSB Berkane
            </p>
            <p className="absolute font-['Manrope:Bold'] font-bold left-[330px] text-[#5d6789] text-[12px] top-[14px]">
              Extérieur
            </p>
            <p className="absolute font-['IBM_Plex_Mono:SemiBold'] left-[420px] text-[#0b1330] text-[13px] top-[13px]">
              0-1
            </p>
            <p className="absolute font-['IBM_Plex_Mono:SemiBold'] left-[534px] text-[#0b1330] text-[13px] top-[13px]">
              71′
            </p>
            <p className="absolute font-['IBM_Plex_Mono:SemiBold'] left-[630px] text-[#9aa4c7] text-[13px] top-[13px]">
              –
            </p>
            <div className="absolute bg-[#9bc53d] flex h-[20px] items-center justify-center left-[694px] px-[6px] rounded-[5px] top-[12px] w-[34px]" data-name="RatingChip">
              <p className="font-['Manrope:ExtraBold'] font-extrabold text-[11px] text-white">
                6,8
              </p>
            </div>
          </div>
          <div className="h-[44px] w-[728px]" data-name="row 03.06">
            <div className="absolute bg-[#eef0f6] h-px left-0 top-0 w-[728px]" data-name="Rectangle" />
            <p className="absolute font-['IBM_Plex_Mono:Medium'] left-0 text-[#5d6789] text-[12px] top-[14px]">
              03.06
            </p>
            <p className="absolute font-['Manrope:ExtraBold'] font-extrabold left-[80px] text-[#0b1330] text-[13px] top-[13px]">
              Wydad AC
            </p>
            <p className="absolute font-['Manrope:Bold'] font-bold left-[330px] text-[#5d6789] text-[12px] top-[14px]">
              Domicile
            </p>
            <p className="absolute font-['IBM_Plex_Mono:SemiBold'] left-[420px] text-[#0b1330] text-[13px] top-[13px]">
              2-1
            </p>
            <p className="absolute font-['IBM_Plex_Mono:SemiBold'] left-[534px] text-[#0b1330] text-[13px] top-[13px]">
              90′
            </p>
            <p className="absolute font-['IBM_Plex_Mono:SemiBold'] left-[614px] text-[#27b36b] text-[13px] top-[13px]">
              1 B
            </p>
            <div className="absolute bg-[#27b36b] flex h-[20px] items-center justify-center left-[694px] px-[6px] rounded-[5px] top-[12px] w-[34px]" data-name="RatingChip">
              <p className="font-['Manrope:ExtraBold'] font-extrabold text-[11px] text-white">
                7,3
              </p>
            </div>
          </div>
          <div className="h-[44px] w-[728px]" data-name="row 22.05">
            <div className="absolute bg-[#eef0f6] h-px left-0 top-0 w-[728px]" data-name="Rectangle" />
            <p className="absolute font-['IBM_Plex_Mono:Medium'] left-0 text-[#5d6789] text-[12px] top-[14px]">
              22.05
            </p>
            <p className="absolute font-['Manrope:ExtraBold'] font-extrabold left-[80px] text-[#0b1330] text-[13px] top-[13px]">
              Maghreb Fès
            </p>
            <p className="absolute font-['Manrope:Bold'] font-bold left-[330px] text-[#5d6789] text-[12px] top-[14px]">
              Extérieur
            </p>
            <p className="absolute font-['IBM_Plex_Mono:SemiBold'] left-[420px] text-[#0b1330] text-[13px] top-[13px]">
              1-0
            </p>
            <p className="absolute font-['IBM_Plex_Mono:SemiBold'] left-[472px] text-[#0b1330] text-[13px] top-[13px]">
              24′ (entré)
            </p>
            <p className="absolute font-['IBM_Plex_Mono:SemiBold'] left-[630px] text-[#9aa4c7] text-[13px] top-[13px]">
              –
            </p>
            <div className="absolute bg-[#27b36b] flex h-[20px] items-center justify-center left-[694px] px-[6px] rounded-[5px] top-[12px] w-[34px]" data-name="RatingChip">
              <p className="font-['Manrope:ExtraBold'] font-extrabold text-[11px] text-white">
                7,0
              </p>
            </div>
          </div>
          <div className="h-[44px] w-[728px]" data-name="row 10.05">
            <div className="absolute bg-[#eef0f6] h-px left-0 top-0 w-[728px]" data-name="Rectangle" />
            <p className="absolute font-['IBM_Plex_Mono:Medium'] left-0 text-[#5d6789] text-[12px] top-[14px]">
              10.05
            </p>
            <p className="absolute font-['Manrope:ExtraBold'] font-extrabold left-[80px] text-[#0b1330] text-[13px] top-[13px]">
              Difaâ El Jadida
            </p>
            <p className="absolute font-['Manrope:Bold'] font-bold left-[330px] text-[#5d6789] text-[12px] top-[14px]">
              Domicile
            </p>
            <p className="absolute font-['IBM_Plex_Mono:SemiBold'] left-[420px] text-[#0b1330] text-[13px] top-[13px]">
              1-1
            </p>
            <p className="absolute font-['IBM_Plex_Mono:SemiBold'] left-[534px] text-[#0b1330] text-[13px] top-[13px]">
              90′
            </p>
            <p className="absolute font-['IBM_Plex_Mono:SemiBold'] left-[630px] text-[#9aa4c7] text-[13px] top-[13px]">
              –
            </p>
            <div className="absolute bg-[#1597b8] flex h-[20px] items-center justify-center left-[694px] px-[6px] rounded-[5px] top-[12px] w-[34px]" data-name="RatingChip">
              <p className="font-['Manrope:ExtraBold'] font-extrabold text-[11px] text-white">
                7,6
              </p>
            </div>
          </div>
          <div className="h-[44px] w-[728px]" data-name="row 06.05">
            <div className="absolute bg-[#eef0f6] h-px left-0 top-0 w-[728px]" data-name="Rectangle" />
            <p className="absolute font-['IBM_Plex_Mono:Medium'] left-0 text-[#5d6789] text-[12px] top-[14px]">
              06.05
            </p>
            <p className="absolute font-['Manrope:ExtraBold'] font-extrabold left-[80px] text-[#0b1330] text-[13px] top-[13px]">
              FUS Rabat
            </p>
            <p className="absolute font-['Manrope:Bold'] font-bold left-[330px] text-[#5d6789] text-[12px] top-[14px]">
              Extérieur
            </p>
            <p className="absolute font-['IBM_Plex_Mono:SemiBold'] left-[420px] text-[#0b1330] text-[13px] top-[13px]">
              1-1
            </p>
            <p className="absolute font-['IBM_Plex_Mono:SemiBold'] left-[534px] text-[#0b1330] text-[13px] top-[13px]">
              65′
            </p>
            <p className="absolute font-['IBM_Plex_Mono:SemiBold'] left-[630px] text-[#9aa4c7] text-[13px] top-[13px]">
              –
            </p>
            <div className="absolute bg-[#f0a020] flex h-[20px] items-center justify-center left-[694px] px-[6px] rounded-[5px] top-[12px] w-[34px]" data-name="RatingChip">
              <p className="font-['Manrope:ExtraBold'] font-extrabold text-[11px] text-white">
                6,1
              </p>
            </div>
          </div>
          <div className="h-[44px] w-[728px]" data-name="row 29.04">
            <div className="absolute bg-[#eef0f6] h-px left-0 top-0 w-[728px]" data-name="Rectangle" />
            <p className="absolute font-['IBM_Plex_Mono:Medium'] left-0 text-[#5d6789] text-[12px] top-[14px]">
              29.04
            </p>
            <p className="absolute font-['Manrope:ExtraBold'] font-extrabold left-[80px] text-[#0b1330] text-[13px] top-[13px]">
              Olympic Safi
            </p>
            <p className="absolute font-['Manrope:Bold'] font-bold left-[330px] text-[#5d6789] text-[12px] top-[14px]">
              Extérieur
            </p>
            <p className="absolute font-['IBM_Plex_Mono:SemiBold'] left-[420px] text-[#0b1330] text-[13px] top-[13px]">
              2-1
            </p>
            <p className="absolute font-['IBM_Plex_Mono:SemiBold'] left-[534px] text-[#0b1330] text-[13px] top-[13px]">
              46′
            </p>
            <p className="absolute font-['IBM_Plex_Mono:SemiBold'] left-[630px] text-[#9aa4c7] text-[13px] top-[13px]">
              –
            </p>
            <div className="absolute bg-[#f0a020] flex h-[20px] items-center justify-center left-[694px] px-[6px] rounded-[5px] top-[12px] w-[34px]" data-name="RatingChip">
              <p className="font-['Manrope:ExtraBold'] font-extrabold text-[11px] text-white">
                6,1
              </p>
            </div>
          </div>
          <div className="h-[44px] w-[728px]" data-name="row 25.04">
            <div className="absolute bg-[#eef0f6] h-px left-0 top-0 w-[728px]" data-name="Rectangle" />
            <p className="absolute font-['IBM_Plex_Mono:Medium'] left-0 text-[#5d6789] text-[12px] top-[14px]">
              25.04
            </p>
            <p className="absolute font-['Manrope:ExtraBold'] font-extrabold left-[80px] text-[#0b1330] text-[13px] top-[13px]">
              Hassania Agadir
            </p>
            <p className="absolute font-['Manrope:Bold'] font-bold left-[330px] text-[#5d6789] text-[12px] top-[14px]">
              Extérieur
            </p>
            <p className="absolute font-['IBM_Plex_Mono:SemiBold'] left-[420px] text-[#0b1330] text-[13px] top-[13px]">
              1-1
            </p>
            <p className="absolute font-['IBM_Plex_Mono:SemiBold'] left-[534px] text-[#0b1330] text-[13px] top-[13px]">
              66′
            </p>
            <p className="absolute font-['IBM_Plex_Mono:SemiBold'] left-[630px] text-[#9aa4c7] text-[13px] top-[13px]">
              –
            </p>
            <div className="absolute bg-[#9bc53d] flex h-[20px] items-center justify-center left-[694px] px-[6px] rounded-[5px] top-[12px] w-[34px]" data-name="RatingChip">
              <p className="font-['Manrope:ExtraBold'] font-extrabold text-[11px] text-white">
                6,5
              </p>
            </div>
          </div>
        </div>
      </div>
      <div className="absolute flex flex-col gap-[20px] items-start left-[920px] top-[554px]" data-name="Right column">
        <div className="bg-white flex flex-col gap-[14px] items-start px-[24px] py-[22px] rounded-[18px] shadow-[0px_8px_24px_0px_rgba(11,19,48,0.07)] w-[400px]" data-name="Éclosion">
          <div className="content-stretch flex items-center justify-between w-full" data-name="head">
            <p className="font-['IBM_Plex_Mono:SemiBold'] text-[#0b1330] text-[12px] tracking-[0.72px]">{`L'ÉCLOSION`}</p>
            <p className="font-['IBM_Plex_Mono:Medium'] text-[#5d6789] text-[11px]">
              minutes par moitié
            </p>
          </div>
          <div className="content-stretch flex gap-[10px] items-baseline" data-name="Frame">
            <p className="bg-clip-text bg-gradient-to-r font-['Changa:ExtraBold'] font-extrabold from-[#5de39b] text-[46px] text-[transparent] to-[#7c6cf0] via-[#7fd6f0] via-[45%]">
              ×6,5
            </p>
            <div className="font-['Manrope:Bold'] font-bold leading-[0] text-[#5d6789] text-[12px]">
              <p className="leading-[normal] mb-0">de temps de jeu en</p>
              <p className="leading-[normal]">seconde moitié de saison</p>
            </div>
          </div>
          <div className="content-stretch flex flex-col gap-[4px] items-start w-full" data-name="Frame">
            <div className="content-stretch flex items-start justify-between w-full" data-name="Frame">
              <p className="font-['Manrope:Bold'] font-bold text-[#5d6789] text-[12px]">
                1re moitié
              </p>
              <p className="font-['IBM_Plex_Mono:SemiBold'] text-[#0b1330] text-[13px]">
                155′
              </p>
            </div>
            <div className="bg-[#dfe3ee] h-[12px] rounded-[4px] w-[54px]" data-name="Rectangle" />
          </div>
          <div className="content-stretch flex flex-col gap-[4px] items-start w-full" data-name="Frame">
            <div className="content-stretch flex items-start justify-between w-full" data-name="Frame">
              <p className="font-['Manrope:Bold'] font-bold text-[#5d6789] text-[12px]">
                2de moitié
              </p>
              <p className="font-['IBM_Plex_Mono:SemiBold'] text-[#0b1330] text-[13px]">
                1 004′
              </p>
            </div>
            <div className="bg-gradient-to-r from-[#5de39b] h-[12px] rounded-[4px] to-[#7c6cf0] via-[#7fd6f0] via-[45%] w-[352px]" data-name="Rectangle" />
          </div>
        </div>
        <div className="bg-white flex flex-col items-start pb-[20px] pt-[22px] px-[24px] rounded-[18px] shadow-[0px_8px_24px_0px_rgba(11,19,48,0.07)] w-[400px]" data-name="Profil">
          <div className="content-stretch flex items-center justify-between pb-[10px] w-full" data-name="head">
            <p className="font-['IBM_Plex_Mono:SemiBold'] text-[#0b1330] text-[12px] tracking-[0.72px]">
              PROFIL
            </p>
            <p className="font-['IBM_Plex_Mono:Medium'] text-[#5d6789] text-[11px]">
              source · date par champ
            </p>
          </div>
          <div className="border-[#eef0f6] border-solid border-t flex items-center justify-between py-[6px] text-[13px] w-full" data-name="kv Club">
            <p className="font-['Manrope:Bold'] font-bold text-[#5d6789]">
              Club
            </p>
            <p className="font-['Manrope:ExtraBold'] font-extrabold text-[#0b1330]">
              Ittihad Tanger
            </p>
          </div>
          <div className="border-[#eef0f6] border-solid border-t flex items-center justify-between py-[6px] text-[13px] w-full" data-name="kv Poste">
            <p className="font-['Manrope:Bold'] font-bold text-[#5d6789]">
              Poste
            </p>
            <p className="font-['Manrope:ExtraBold'] font-extrabold text-[#0b1330]">
              Défenseur
            </p>
          </div>
          <div className="border-[#eef0f6] border-solid border-t flex items-center justify-between py-[6px] text-[13px] w-full" data-name="kv Âge">
            <p className="font-['Manrope:Bold'] font-bold text-[#5d6789]">
              Âge
            </p>
            <p className="font-['Manrope:ExtraBold'] font-extrabold text-[#0b1330]">
              22 ans
            </p>
          </div>
          <div className="border-[#eef0f6] border-solid border-t flex items-center justify-between py-[6px] text-[13px] w-full" data-name="kv Numéro">
            <p className="font-['Manrope:Bold'] font-bold text-[#5d6789]">
              Numéro
            </p>
            <p className="font-['Manrope:ExtraBold'] font-extrabold text-[#0b1330]">
              5
            </p>
          </div>
          <div className="border-[#eef0f6] border-solid border-t flex items-center justify-between py-[6px] w-full" data-name="kv Pied">
            <p className="font-['Manrope:Bold'] font-bold text-[#5d6789] text-[13px]">
              Pied
            </p>
            <div className="bg-[rgba(255,176,32,0.16)] flex items-start px-[8px] py-[3px] rounded-[6px]" data-name="N.R.">
              <p className="font-['IBM_Plex_Mono:SemiBold'] text-[#a86400] text-[11px]">
                N.R. · non renseigné
              </p>
            </div>
          </div>
          <div className="border-[#eef0f6] border-solid border-t flex items-center justify-between py-[6px] w-full" data-name="kv Taille">
            <p className="font-['Manrope:Bold'] font-bold text-[#5d6789] text-[13px]">
              Taille
            </p>
            <div className="bg-[rgba(255,176,32,0.16)] flex items-start px-[8px] py-[3px] rounded-[6px]" data-name="N.R.">
              <p className="font-['IBM_Plex_Mono:SemiBold'] text-[#a86400] text-[11px]">
                N.R. · non renseigné
              </p>
            </div>
          </div>
          <div className="border-[#eef0f6] border-solid border-t flex items-center justify-between py-[6px] w-full" data-name="kv Nationalité">
            <p className="font-['Manrope:Bold'] font-bold text-[#5d6789] text-[13px]">
              Nationalité
            </p>
            <div className="bg-[rgba(255,176,32,0.16)] flex items-start px-[8px] py-[3px] rounded-[6px]" data-name="N.R.">
              <p className="font-['IBM_Plex_Mono:SemiBold'] text-[#a86400] text-[11px]">
                N.R. · non renseigné
              </p>
            </div>
          </div>
          <div className="relative size-[10px]" data-name="Frame" />
          <p className="font-['Manrope:Bold'] font-bold min-w-full text-[#1b2a6b] text-[12px] w-[min-content]">
            Une donnée manquante ou fausse ? Signaler au data desk →
          </p>
        </div>
        <div className="bg-white flex flex-col gap-[14px] items-start px-[24px] py-[22px] rounded-[18px] shadow-[0px_8px_24px_0px_rgba(11,19,48,0.07)] w-[400px]" data-name="Face à face">
          <div className="content-stretch flex items-center justify-between w-full" data-name="head">
            <p className="font-['IBM_Plex_Mono:SemiBold'] text-[#0b1330] text-[12px] tracking-[0.72px]">
              FACE À FACE
            </p>
            <p className="font-['IBM_Plex_Mono:Medium'] text-[#5d6789] text-[11px]">
              défenseurs U23
            </p>
          </div>
          <div className="content-stretch flex items-center justify-between w-full" data-name="Frame">
            <div className="content-stretch flex flex-col items-start" data-name="Frame">
              <p className="font-['Changa:ExtraBold'] font-extrabold text-[#1b2a6b] text-[34px]">
                70
              </p>
              <p className="font-['Manrope:ExtraBold'] font-extrabold text-[#0b1330] text-[13px]">
                M. El Arouch
              </p>
              <p className="font-['IBM_Plex_Mono:Medium'] text-[#5d6789] text-[10px]">
                IRT · #5
              </p>
            </div>
            <p className="bg-clip-text bg-gradient-to-r font-['Changa:ExtraBold'] font-extrabold from-[#5de39b] text-[22px] text-[transparent] to-[#7c6cf0] via-[#7fd6f0] via-[45%]">
              VS
            </p>
            <div className="content-stretch flex flex-col items-end" data-name="Frame">
              <p className="font-['Changa:ExtraBold'] font-extrabold text-[#1b2a6b] text-[34px]">
                69
              </p>
              <p className="font-['Manrope:ExtraBold'] font-extrabold text-[#0b1330] text-[13px]">
                A. Sanogo
              </p>
              <p className="font-['IBM_Plex_Mono:Medium'] text-[#5d6789] text-[10px]">
                DHJ · #6
              </p>
            </div>
          </div>
          <div className="content-stretch flex items-start justify-between w-full" data-name="Frame">
            <p className="font-['IBM_Plex_Mono:SemiBold'] text-[#0b1330] text-[13px]">
              1 159
            </p>
            <p className="font-['IBM_Plex_Mono:Medium'] text-[#5d6789] text-[10px] tracking-[0.6px]">
              MINUTES
            </p>
            <p className="font-['IBM_Plex_Mono:SemiBold'] text-[#27b36b] text-[13px]">
              2 165
            </p>
          </div>
          <div className="content-stretch flex items-start justify-between w-full" data-name="Frame">
            <p className="font-['IBM_Plex_Mono:SemiBold'] text-[#0b1330] text-[13px]">
              6,60
            </p>
            <p className="font-['IBM_Plex_Mono:Medium'] text-[#5d6789] text-[10px] tracking-[0.6px]">
              NOTE
            </p>
            <p className="font-['IBM_Plex_Mono:SemiBold'] text-[#27b36b] text-[13px]">
              6,62
            </p>
          </div>
          <div className="content-stretch flex items-start justify-between w-full" data-name="Frame">
            <p className="font-['IBM_Plex_Mono:SemiBold'] text-[#27b36b] text-[13px]">
              6,72
            </p>
            <p className="font-['IBM_Plex_Mono:Medium'] text-[#5d6789] text-[10px] tracking-[0.6px]">
              FORME
            </p>
            <p className="font-['IBM_Plex_Mono:SemiBold'] text-[#0b1330] text-[13px]">
              6,38
            </p>
          </div>
          <div className="bg-[#1b2a6b] flex h-[38px] items-center justify-center px-[18px] rounded-[999px] w-full" data-name="Button">
            <p className="font-['Manrope:ExtraBold'] font-extrabold text-[13px] text-white">
              Ouvrir le face à face →
            </p>
          </div>
        </div>
      </div>
      <p className="absolute font-['Manrope:Bold'] font-bold left-[120px] text-[#5d6789] text-[12px] top-[1814px]">
        Données : matchs Botola Pro 2025-26 (SportsMonks). Percentiles et Rising score calculés par BotolaGO Data. Photo : visuel interne provisoire, sans licence de diffusion.
      </p>
      <p className="absolute font-['Manrope:ExtraBold'] font-extrabold left-[120px] text-[#1b2a6b] text-[12px] top-[1836px]">
        Comment on calcule →
      </p>
    </div>
  );
}
