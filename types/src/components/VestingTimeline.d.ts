import { VestingStream } from "@/lib/vesting/normalize";
interface VestingTimelineProps {
    streams: VestingStream[];
    showRecipient?: boolean;
}
export declare function VestingTimeline({ streams, showRecipient }: VestingTimelineProps): import("react/jsx-runtime").JSX.Element;
export {};
