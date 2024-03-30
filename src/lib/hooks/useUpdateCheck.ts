import React from 'react'
import {Alert, AppState, AppStateStatus} from 'react-native'
import app from 'react-native-version-number'
import {
  checkForUpdateAsync,
  fetchUpdateAsync,
  isEnabled,
  reloadAsync,
  setExtraParamAsync,
  useUpdates,
} from 'expo-updates'

import {logger} from '#/logger'
import {isIOS} from 'platform/detection'
import {IS_TESTFLIGHT} from '#/env'

async function setExtraParams() {
  await setExtraParamAsync(
    isIOS ? 'ios-build-number' : 'android-build-number',
    app.buildVersion,
  )
  await setExtraParamAsync(
    'channel',
    IS_TESTFLIGHT ? 'testflight' : 'production',
  )
}

export function useUpdateCheck() {
  const appState = React.useRef<AppStateStatus>('active')
  const lastMinimize = React.useRef(0)
  const ranInitialCheck = React.useRef(false)
  const timeout = React.useRef<NodeJS.Timeout>()
  const {isUpdatePending} = useUpdates()

  const setCheckTimeout = React.useCallback(() => {
    timeout.current = setTimeout(async () => {
      try {
        await setExtraParams()

        logger.debug('Checking for update...')
        const res = await checkForUpdateAsync()

        if (!res.isAvailable) {
          logger.debug('No update available.')
          return
        }

        logger.debug('Attempting to fetch update...')
        await fetchUpdateAsync()
        logger.debug('Successfully fetched update')
      } catch (e) {
        logger.warn('OTA Update Error', {error: `${e}`})
      }
    }, 10e3)
  }, [])

  const onIsTestFlight = React.useCallback(() => {
    setTimeout(async () => {
      await setExtraParams()

      try {
        const res = await checkForUpdateAsync()
        if (res.isAvailable) {
          await fetchUpdateAsync()

          Alert.alert(
            'Update Available',
            'A new version of the app is available. Relaunch now?',
            [
              {
                text: 'No',
                style: 'cancel',
              },
              {
                text: 'Relaunch',
                style: 'default',
                onPress: async () => {
                  await reloadAsync()
                },
              },
            ],
          )
        }
      } catch (e: any) {
        // No need to handle
      }
    }, 3000)
  }, [])

  React.useEffect(() => {
    // For Testflight users, we can prompt the user to update immediately whenever there's an available update. This
    // is suspect however with the Apple App Store guidelines, so we don't want to prompt production users to update
    // immediately.
    if (IS_TESTFLIGHT) {
      onIsTestFlight()
      return
    } else if (!isEnabled || __DEV__ || ranInitialCheck.current) {
      // Development client shouldn't check for updates at all, so we skip that here.
      return
    }

    setCheckTimeout()
    ranInitialCheck.current = true
  }, [onIsTestFlight, setCheckTimeout])

  // After the app has been minimized for 30 minutes, we want to either A. install an update if one has become available
  // or B check for an update again.
  React.useEffect(() => {
    if (!isEnabled) return

    const subscription = AppState.addEventListener(
      'change',
      async nextAppState => {
        if (
          appState.current.match(/inactive|background/) &&
          nextAppState === 'active'
        ) {
          // If it's been 15 minutes since the last "minimize", we should feel comfortable updating the client since
          // chances are that there isn't anything important going on in the current session.
          if (lastMinimize.current <= Date.now() - 15 * 60e3) {
            if (isUpdatePending) {
              await reloadAsync()
            } else {
              setCheckTimeout()
            }
          }
        } else {
          lastMinimize.current = Date.now()
        }

        appState.current = nextAppState
      },
    )

    return () => {
      clearTimeout(timeout.current)
      subscription.remove()
    }
  }, [isUpdatePending, setCheckTimeout])
}
