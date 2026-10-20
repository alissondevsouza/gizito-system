import {
  type DifficultyDistribution,
  MAX_PERCEIVED_DIFFICULTY_SHIFT,
  MAX_TOPIC_COUNT,
  MIN_QUESTION_COUNT_PER_TOPIC_PER_BLOCK,
  MIN_TOPIC_COUNT,
  MOCK_DIFFICULTY_DISTRIBUTION,
  PERCEIVED_DIFFICULTY_SHIFT_DIRECTION_MAP,
  PRACTICE_DIFFICULTY_DISTRIBUTION,
  type TopicCount,
} from "#src/constants.ts";
import type { Difficulty, PerceivedDifficulty, QuestionBlock } from "#src/enums.ts";
import {
  mockQuestionIdList,
  practiceQuestionIdList,
  type QuestionId,
  type TopicRef,
  type WorkedExampleId,
  workedExampleIdList,
} from "#src/pedagogy/kit-item.ts";
import { err, ok, type Result } from "#src/result.ts";

export type QuestionSlot = {
  readonly slotId: QuestionId;
  readonly block: QuestionBlock;
  readonly topicRef: TopicRef;
  readonly difficulty: Difficulty;
};

export type WorkedExampleSlot = {
  readonly exampleId: WorkedExampleId;
  readonly topicRef: TopicRef;
};

export type KitSlotPlan = {
  readonly practiceSlotList: readonly QuestionSlot[];
  readonly mockSlotList: readonly QuestionSlot[];
  readonly workedExampleSlotList: readonly WorkedExampleSlot[];
  readonly reviewSectionTopicRefList: readonly TopicRef[];
};

export class InvalidTopicRefListError extends Error {
  override readonly name = "InvalidTopicRefListError";
  constructor(readonly topicCount: number) {
    super(`planKitSlots needs ${MIN_TOPIC_COUNT} to ${MAX_TOPIC_COUNT} distinct topics`);
  }
}

export function shiftedDifficultyDistribution(
  block: QuestionBlock,
  perceivedDifficulty: PerceivedDifficulty | null,
): DifficultyDistribution {
  const distribution =
    block === "practice" ? PRACTICE_DIFFICULTY_DISTRIBUTION : MOCK_DIFFICULTY_DISTRIBUTION;
  const shift =
    perceivedDifficulty === null
      ? 0
      : PERCEIVED_DIFFICULTY_SHIFT_DIRECTION_MAP[perceivedDifficulty] *
        MAX_PERCEIVED_DIFFICULTY_SHIFT;
  return { ...distribution, easy: distribution.easy + shift, medium: distribution.medium - shift };
}

function isTopicCount(count: number): count is TopicCount {
  return count >= MIN_TOPIC_COUNT && count <= MAX_TOPIC_COUNT;
}

type Seat = { readonly topicRef: TopicRef; readonly topicIndex: number };

function listSeat(topicRefList: readonly TopicRef[], topicCount: TopicCount, blockSize: number) {
  const minimum = MIN_QUESTION_COUNT_PER_TOPIC_PER_BLOCK[topicCount];
  const remaining = blockSize - topicCount * minimum;
  const countList = topicRefList.map(
    (_, topicIndex) =>
      minimum + Math.floor(remaining / topicCount) + (topicIndex < remaining % topicCount ? 1 : 0),
  );
  return Array.from({ length: Math.max(...countList) }, (_, round) =>
    topicRefList.flatMap((topicRef, topicIndex): Seat[] =>
      round < (countList[topicIndex] ?? 0) ? [{ topicRef, topicIndex }] : [],
    ),
  ).flat();
}

function difficultyOfSeat(distribution: DifficultyDistribution, seatIndex: number): Difficulty {
  if (seatIndex < distribution.easy) return "easy";
  return seatIndex < distribution.easy + distribution.medium ? "medium" : "hard";
}

function planBlock(
  block: QuestionBlock,
  topicRefList: readonly TopicRef[],
  topicCount: TopicCount,
  perceivedDifficulty: PerceivedDifficulty | null,
): readonly QuestionSlot[] {
  const idList = block === "practice" ? practiceQuestionIdList : mockQuestionIdList;
  const distribution = shiftedDifficultyDistribution(block, perceivedDifficulty);
  const seatList = listSeat(topicRefList, topicCount, idList.length).map((seat, seatIndex) => ({
    ...seat,
    seatIndex,
    difficulty: difficultyOfSeat(distribution, seatIndex),
  }));
  const orderedSeatList =
    block === "mock"
      ? seatList
      : seatList.toSorted(
          (left, right) => left.topicIndex - right.topicIndex || left.seatIndex - right.seatIndex,
        );
  return idList.flatMap((slotId, index): QuestionSlot[] => {
    const seat = orderedSeatList[index];
    return seat === undefined
      ? []
      : [{ slotId, block, topicRef: seat.topicRef, difficulty: seat.difficulty }];
  });
}

export function planKitSlots(
  topicRefList: readonly TopicRef[],
  perceivedDifficulty: PerceivedDifficulty | null,
): Result<KitSlotPlan, InvalidTopicRefListError> {
  const topicCount = topicRefList.length;
  const [firstTopicRef] = topicRefList;
  if (
    firstTopicRef === undefined ||
    !isTopicCount(topicCount) ||
    new Set(topicRefList).size !== topicCount
  ) {
    return err(new InvalidTopicRefListError(topicCount));
  }
  return ok({
    practiceSlotList: planBlock("practice", topicRefList, topicCount, perceivedDifficulty),
    mockSlotList: planBlock("mock", topicRefList, topicCount, perceivedDifficulty),
    workedExampleSlotList: workedExampleIdList.map((exampleId, index) => ({
      exampleId,
      topicRef: topicRefList[index] ?? firstTopicRef,
    })),
    reviewSectionTopicRefList: [...topicRefList],
  });
}
