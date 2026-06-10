import { useLocalSearchParams } from "expo-router";
import { FlowEditor } from "../../../../src/components/bot/FlowEditor";

export default function BotFlowEditorRoute(): JSX.Element {
  const { flowId } = useLocalSearchParams<{ flowId: string }>();
  return <FlowEditor flowId={flowId ?? ""} />;
}
