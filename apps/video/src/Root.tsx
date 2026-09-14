import { Composition, Still } from "remotion";
import { LaunchVideo, type LaunchVideoProps } from "./compositions/LaunchVideo";
import { SocialCampaign, HomepageCampaign } from "./compositions/Campaign";
import { NativePreview } from "./compositions/NativePreview";

const launchProps: LaunchVideoProps = {
  tagline: "Weniger Papierkram. Mehr Kopf frei.",
};

export const RemotionRoot = () => {
  return (
    <>
      <Composition
        id="OrdiloLaunch"
        component={LaunchVideo}
        durationInFrames={1110}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={launchProps}
      />
      <Composition
        id="AppStore-MagicFlow"
        component={NativePreview}
        durationInFrames={540}
        fps={30}
        width={886}
        height={1920}
      />
      <Composition
        id="Instagram-FamilyReel"
        component={SocialCampaign}
        durationInFrames={600}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="Homepage-QuietLoop"
        component={HomepageCampaign}
        durationInFrames={900}
        fps={30}
        width={1920}
        height={1080}
      />
      <Still
        id="OrdiloLaunchPoster"
        component={LaunchVideo}
        width={1080}
        height={1920}
        defaultProps={launchProps}
      />
    </>
  );
};
