import { ActionIcon, Skeleton, Tooltip, Text } from "@mantine/core";
import { IconArrowUp } from "@tabler/icons-react";
import {
  explorePaneUrlValue,
  googleSearchResultUrlAtom,
  studyConditionAtom,
} from "../recoil";
import { useRecoilValue } from "recoil";
import { StudyCondition } from "../types";

interface ExplorePaneProps {
  loading: boolean;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
}

const ExplorePane = ({ loading, setLoading }: ExplorePaneProps) => {
  const explorePaneUrl = useRecoilValue(explorePaneUrlValue);
  const googleSearchResultUrl = useRecoilValue(googleSearchResultUrlAtom);
  const studyCondition = useRecoilValue(studyConditionAtom);
  const viewMoreUrl =
    studyCondition === StudyCondition.CONVOSCOPE
      ? explorePaneUrl
      : studyCondition === StudyCondition.GOOGLE
      ? googleSearchResultUrl
      : undefined;

  const handleLoad = () => {
    setLoading(false);
  };

  return (
    <Skeleton
      visible={loading}
      h={"100%"}
      w={"100%"}
      sx={{ position: "relative" }}
    >
      <Tooltip label="Open page in browser">
        <ActionIcon
          component="a"
          href={viewMoreUrl}
          target="_blank"
          variant="light"
          color="indigo"
          size="xl"
          radius="xl"
          sx={{ position: "absolute", right: 0, bottom: 0 }}
        >
          <IconArrowUp style={{ width: "70%", height: "70%" }} stroke={1.5} />
        </ActionIcon>
      </Tooltip>
      {viewMoreUrl === undefined ? (
        studyCondition === StudyCondition.CONVOSCOPE && (
          <Text m="auto" w="fit-content">
            Click on a card with a link to explore.
          </Text>
        )
      ) : (
        <iframe
          id="zoomed-in-iframe"
          src={viewMoreUrl}
          onLoad={handleLoad}
          width="100%"
          height="100%"
          frameBorder={0}
          sandbox=""
        ></iframe>
      )}
    </Skeleton>
  );
};

export default ExplorePane;
