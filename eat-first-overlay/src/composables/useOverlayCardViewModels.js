import { computed, unref } from 'vue'
import { nominationsFromRoom } from '../services/gameService'

/**
 * Зведення похідних пропсів для OverlayPlayerCard (глобальна мозаїка + solo), щоб
 * OverlayPage не тягнув десятки дрібних функцій у шаблоні.
 *
 * @param {{
 *   gameId: import('vue').Ref<string> | import('vue').ComputedRef<string>,
 *   gameRoom: import('vue').Ref<Record<string, unknown>>,
 *   votes: import('vue').Ref<Array<Record<string, unknown>>>,
 *   roomRound: import('vue').ComputedRef<number>,
 *   singlePlayer: import('vue').Ref<Record<string, unknown> | null>,
 *   activeSpotlightId: import('vue').ComputedRef<string | null>,
 *   speakerForTimerId: import('vue').ComputedRef<string | null>,
 *   speakerTimeLeft: import('vue').Ref<number | undefined> | import('vue').ComputedRef<number | undefined>,
 *   speakerTimerTotal: import('vue').Ref<number> | import('vue').ComputedRef<number>,
 *   cinemaGrid: import('vue').ComputedRef<boolean>,
 *   cinemaHud: import('vue').ComputedRef<boolean>,
 *   dramaMode: import('vue').ComputedRef<boolean>,
 *   dramaPersonal: import('vue').ComputedRef<boolean>,
 *   votingActive: import('vue').ComputedRef<boolean>,
 *   votingTargetId: import('vue').ComputedRef<string>,
 *   nominatedPlayerId: import('vue').ComputedRef<string>,
 *   nominatedById: import('vue').ComputedRef<string>,
 *   personalHasVotedThisRound: import('vue').ComputedRef<boolean>,
 *   personalIsVoteTarget: import('vue').ComputedRef<boolean>,
 *   showIdleWaitingCue: import('vue').ComputedRef<boolean>,
 *   handsClusterMode: import('vue').ComputedRef<boolean>,
 *   isHandRaised: (p: object) => boolean,
 *   playersDisplayOrderedForGlobalMosaic?: import('vue').ComputedRef<Array<Record<string, unknown>>> | import('vue').Ref<Array<Record<string, unknown>>>,
 *   liveKitTileForPlayer?: (player: Record<string, unknown>) => unknown,
 *   liveKitVolumeForPlayer?: (player: Record<string, unknown>) => number,
 * }} ctx
 */
export function useOverlayCardViewModels(ctx) {
  const {
    gameId,
    gameRoom,
    votes,
    roomRound,
    singlePlayer,
    activeSpotlightId,
    speakerForTimerId,
    speakerTimeLeft,
    speakerTimerTotal,
    cinemaGrid,
    cinemaHud,
    dramaMode,
    dramaPersonal,
    votingActive,
    votingTargetId,
    nominatedPlayerId,
    nominatedById,
    personalHasVotedThisRound,
    personalIsVoteTarget,
    showIdleWaitingCue,
    handsClusterMode,
    isHandRaised,
    playersDisplayOrderedForGlobalMosaic: playersDisplayOrderedRef,
    liveKitTileForPlayer: lkTileFn,
    liveKitVolumeForPlayer: lkVolumeFn,
  } = ctx

  function slotNumFromId(id) {
    const s = String(id ?? '')
    const m = s.match(/^p(\d+)$/i)
    if (m) return m[1]
    return s.replace(/^p/i, '') || s
  }

  function nominatorsLineFor(pid) {
    const id = String(pid ?? '')
    const list = nominationsFromRoom(gameRoom.value)
    const nums = list.filter((x) => String(x.target) === id).map((x) => slotNumFromId(x.by))
    if (nums.length) return nums.join(', ')
    const n = String(gameRoom.value?.nominatedPlayer ?? '').trim()
    const b = String(gameRoom.value?.nominatedBy ?? '').trim()
    if (n === id && b) return slotNumFromId(b)
    return ''
  }

  function votesForTarget(playerId) {
    const pid = String(playerId ?? '')
    return votes.value.filter(
      (v) => Number(v.round) === roomRound.value && String(v.targetPlayer) === pid,
    )
  }

  function isSpotlightPlayer(p) {
    return activeSpotlightId.value != null && p.id === activeSpotlightId.value
  }

  function isTimerPlayer(p) {
    return speakerForTimerId.value != null && p.id === speakerForTimerId.value
  }

  function cardTimerProps(p) {
    if (!isTimerPlayer(p) || speakerTimeLeft.value === undefined) return {}
    return {
      speakerTimeLeft: speakerTimeLeft.value,
      speakerTimerTotal: speakerTimerTotal.value,
    }
  }

  function globalMosaicCardProps(p) {
    return {
      mosaicTile: true,
      solo: true,
      player: p,
      isSpotlight: isSpotlightPlayer(p),
      isTimerTarget: isTimerPlayer(p),
      cinema: cinemaGrid.value,
      drama: dramaMode.value,
      votingActive: votingActive.value,
      votingTargetId: votingTargetId.value,
      voteInteractive: false,
      hideVoteStrip: true,
      gameId: unref(gameId),
      nominatedPlayerId: nominatedPlayerId.value,
      nominatedById: nominatedById.value,
      nominatorsLine: nominatorsLineFor(p.id),
      roomRound: roomRound.value,
      votesReceived: votesForTarget(p.id),
      hasVotedThisRound: false,
      isVoteTargetSelf: false,
      handRaised: isHandRaised(p),
      suppressHandBadge: handsClusterMode.value,
      ...cardTimerProps(p),
    }
  }

  const soloCardViewModel = computed(() => {
    const p = singlePlayer.value
    if (!p) return null
    return {
      player: p,
      isSpotlight: isSpotlightPlayer(p),
      isTimerTarget: isTimerPlayer(p),
      cinema: cinemaHud.value,
      drama: dramaPersonal.value,
      votingActive: votingActive.value,
      votingTargetId: votingTargetId.value,
      voteInteractive: false,
      hideVoteStrip: true,
      gameId: unref(gameId),
      nominatedPlayerId: nominatedPlayerId.value,
      nominatedById: nominatedById.value,
      nominatorsLine: nominatorsLineFor(p.id),
      roomRound: roomRound.value,
      votesReceived: votesForTarget(p.id),
      hasVotedThisRound: personalHasVotedThisRound.value,
      isVoteTargetSelf: personalIsVoteTarget.value,
      handRaised: isHandRaised(p),
      idleWaiting: showIdleWaitingCue.value,
      solo: true,
      ...cardTimerProps(p),
    }
  })

  const globalMosaicCardViewModels = computed(() => {
    if (!playersDisplayOrderedRef || !lkTileFn || !lkVolumeFn) return []
    const order = playersDisplayOrderedRef.value
    if (!order?.length) return []
    return order.map((player) => ({
      player,
      tile: lkTileFn(player),
      volume: lkVolumeFn(player),
      card: globalMosaicCardProps(player),
    }))
  })

  return {
    slotNumFromId,
    nominatorsLineFor,
    votesForTarget,
    soloCardViewModel,
    globalMosaicCardViewModels,
  }
}
