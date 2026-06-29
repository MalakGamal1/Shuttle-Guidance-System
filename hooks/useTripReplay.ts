'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import type { TripLocationHistory, PlaybackSpeed, PlaybackState } from '@/types/trip-types'

// ─────────────────────────────────────────────────────────────
//  useTripReplay — Playback state machine for trip route replay
// ─────────────────────────────────────────────────────────────

export function useTripReplay(locationHistory: TripLocationHistory[]) {
  const [state, setState] = useState<PlaybackState>({
    isPlaying: false,
    isPaused: false,
    currentIndex: 0,
    speed: 1,
    currentTimestamp: null,
    progress: 0,
  })

  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const stateRef = useRef(state)
  stateRef.current = state

  const totalPoints = locationHistory.length

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  // Get current position
  const currentPosition = totalPoints > 0 && state.currentIndex < totalPoints
    ? { lat: locationHistory[state.currentIndex].lat, lng: locationHistory[state.currentIndex].lng }
    : null

  const currentTimestamp = totalPoints > 0 && state.currentIndex < totalPoints
    ? locationHistory[state.currentIndex].timestamp
    : null

  // Calculate progress percentage
  const progress = totalPoints > 1
    ? Math.round((state.currentIndex / (totalPoints - 1)) * 100)
    : 0

  // Start/resume playback
  const play = useCallback(() => {
    if (totalPoints < 2) return

    // If at end, restart
    const startIndex = stateRef.current.currentIndex >= totalPoints - 1 ? 0 : stateRef.current.currentIndex

    setState(prev => ({
      ...prev,
      isPlaying: true,
      isPaused: false,
      currentIndex: startIndex,
    }))

    if (intervalRef.current) clearInterval(intervalRef.current)

    // Base interval: 500ms between points, divided by speed
    const baseInterval = 500
    intervalRef.current = setInterval(() => {
      setState(prev => {
        const nextIndex = prev.currentIndex + 1
        if (nextIndex >= totalPoints) {
          if (intervalRef.current) clearInterval(intervalRef.current)
          return {
            ...prev,
            isPlaying: false,
            isPaused: false,
            currentIndex: totalPoints - 1,
            progress: 100,
          }
        }
        return {
          ...prev,
          currentIndex: nextIndex,
          progress: Math.round((nextIndex / (totalPoints - 1)) * 100),
        }
      })
    }, baseInterval / stateRef.current.speed)
  }, [totalPoints, locationHistory])

  // Pause
  const pause = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    setState(prev => ({ ...prev, isPlaying: false, isPaused: true }))
  }, [])

  // Resume
  const resume = useCallback(() => {
    play()
  }, [play])

  // Set speed
  const setSpeed = useCallback((speed: PlaybackSpeed) => {
    setState(prev => ({ ...prev, speed }))
    // If playing, restart with new speed
    if (stateRef.current.isPlaying) {
      if (intervalRef.current) clearInterval(intervalRef.current)
      const baseInterval = 500
      intervalRef.current = setInterval(() => {
        setState(prev => {
          const nextIndex = prev.currentIndex + 1
          if (nextIndex >= totalPoints) {
            if (intervalRef.current) clearInterval(intervalRef.current)
            return { ...prev, isPlaying: false, isPaused: false, currentIndex: totalPoints - 1, progress: 100 }
          }
          return { ...prev, currentIndex: nextIndex, progress: Math.round((nextIndex / (totalPoints - 1)) * 100) }
        })
      }, baseInterval / speed)
    }
  }, [totalPoints])

  // Seek to specific index
  const seekTo = useCallback((index: number) => {
    const clampedIndex = Math.max(0, Math.min(index, totalPoints - 1))
    setState(prev => ({
      ...prev,
      currentIndex: clampedIndex,
      progress: totalPoints > 1 ? Math.round((clampedIndex / (totalPoints - 1)) * 100) : 0,
    }))
  }, [totalPoints])

  // Reset
  const reset = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    setState({
      isPlaying: false,
      isPaused: false,
      currentIndex: 0,
      speed: 1,
      currentTimestamp: null,
      progress: 0,
    })
  }, [])

  return {
    ...state,
    currentPosition,
    currentTimestamp,
    progress,
    totalPoints,
    play,
    pause,
    resume,
    setSpeed,
    seekTo,
    reset,
  }
}
