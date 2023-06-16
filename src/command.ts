import path from 'path'
import extend from 'just-extend'
import {MATCH, RECORD} from './constants'
import type {
  CypressImageSnapshotOptions,
  DiffSnapshotResult,
  SnapshotOptions,
  Subject,
} from './types'

const PNG_EXT = '.png'
const SNAP_EXT = `.snap${PNG_EXT}`

const COMMAND_NAME = 'cypress-image-snapshot'
const screenshotsFolder =
  Cypress.config('screenshotsFolder') || 'cypress/screenshots'
const isUpdateSnapshots: boolean = Cypress.env('updateSnapshots') || false
const isSnapshotDebug: boolean = Cypress.env('debugSnapshots') || false

const defaultOptions: SnapshotOptions = {
  screenshotsFolder,
  isUpdateSnapshots,
  isSnapshotDebug,
  specFileName: Cypress.spec.name,
  currentTestTitle: '',
  failureThreshold: 0,
  failureThresholdType: 'pixel',
  recursiveTimeout: 5000,
  delayBetweenTries: 2000,
}

/**
 * Add this function to your `supportFile` for e2e/component
 * Accepts options that are used for all instances of `toMatchSnapshot`
 */
export const addMatchImageSnapshotCommand = (
  defaultOptionsOverrides: CypressImageSnapshotOptions = {},
) => {
  Cypress.Commands.add(
    'matchImageSnapshot',
    {
      prevSubject: ['optional', 'element', 'document', 'window'],
    },
    matchImageSnapshot(defaultOptionsOverrides),
  )
}

const matchImageSnapshot =
  (defaultOptionsOverrides: CypressImageSnapshotOptions) =>
  (
    subject: Subject,
    nameOrCommandOptions: CypressImageSnapshotOptions | string,
    commandOptions?: CypressImageSnapshotOptions,
  ) => {
    // access the env here so that it can be overridden in tests
    const isFailOnSnapshotDiff: boolean =
      typeof Cypress.env('failOnSnapshotDiff') === 'undefined' || false
    const isRequireSnapshots: boolean = Cypress.env('requireSnapshots') || false

    const {filename, options} = getNameAndOptions(
      nameOrCommandOptions,
      defaultOptionsOverrides,
      commandOptions,
    )

    const elementToScreenshot = cy.wrap(subject)
    cy.task(MATCH, {
      ...options,
      currentTestTitle: Cypress.currentTest.title,
    })

    const screenshotName = getScreenshotFilename(filename)

    function recursiveSnapshot():
      | Cypress.Chainable<DiffSnapshotResult>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      | Cypress.Chainable<DiffSnapshotResult | Cypress.Chainable<any>> {
      const currentTime = Date.now()
      const hasTimedOut =
        currentTime - startTime >= Math.abs(options.recursiveTimeout)

      elementToScreenshot.screenshot(screenshotName, options)
      return cy.task<DiffSnapshotResult>(RECORD).then((snapshotResult) => {
        const {
          added,
          pass,
          updated,
          imageDimensions,
          diffPixelCount,
          diffRatio,
          diffSize,
          diffOutputPath,
        } = snapshotResult

        if (pass) {
          return
        }

        if (added && isRequireSnapshots) {
          const message = `New snapshot: '${screenshotName}' was added, but 'requireSnapshots' was set to true.
            This is likely because this test was run in a CI environment in which snapshots should already be committed.`
          if (isFailOnSnapshotDiff) {
            throw new Error(message)
          } else {
            Cypress.log({name: COMMAND_NAME, message})
            return
          }
        }

        if (!pass && !added && !updated) {
          const message = diffSize
            ? `Image size (${imageDimensions.baselineWidth}x${imageDimensions.baselineHeight}) different than saved snapshot size (${imageDimensions.receivedWidth}x${imageDimensions.receivedHeight}).\nSee diff for details: ${diffOutputPath}`
            : `Image was ${
                diffRatio * 100
              }% different from saved snapshot with ${diffPixelCount} different pixels.\nSee diff for details: ${diffOutputPath}`

          if (isFailOnSnapshotDiff && hasTimedOut) {
            throw new Error(message)
          } else if (hasTimedOut) {
            Cypress.log({name: COMMAND_NAME, message})
          } else {
            Cypress.log({name: COMMAND_NAME, message})
            Cypress.log({
              message: `Attempt ${currentAttempt.toString()} out of ${totalAttempts.toString()}`,
            })
            currentAttempt++
            return cy.wait(options.delayBetweenTries).then(() => {
              return recursiveSnapshot()
            })
          }
        }
      })
    }

    const totalAttempts = Math.floor(
      options.recursiveTimeout / options.delayBetweenTries,
    )
    let currentAttempt = 1
    const startTime = Date.now()
    recursiveSnapshot()
  }

const getNameAndOptions = (
  nameOrCommandOptions: CypressImageSnapshotOptions | string,
  defaultOptionsOverrides: CypressImageSnapshotOptions,
  commandOptions?: CypressImageSnapshotOptions,
) => {
  let filename: string | undefined
  let options = extend(
    true,
    {},
    defaultOptions,
    defaultOptionsOverrides,
  ) as SnapshotOptions
  if (typeof nameOrCommandOptions === 'string' && commandOptions) {
    filename = nameOrCommandOptions
    options = extend(
      true,
      {},
      defaultOptions,
      defaultOptionsOverrides,
      commandOptions,
    ) as SnapshotOptions
  }
  if (typeof nameOrCommandOptions === 'string') {
    filename = nameOrCommandOptions
  }
  if (typeof nameOrCommandOptions === 'object') {
    options = extend(
      true,
      {},
      defaultOptions,
      defaultOptionsOverrides,
      nameOrCommandOptions,
    ) as SnapshotOptions
  }
  return {
    filename,
    options,
  }
}

const getScreenshotFilename = (filename: string | undefined) => {
  if (filename) {
    return filename
  }
  return Cypress.currentTest.titlePath.join(' -- ')
}

/**
 * replaces forward slashes (/) and backslashes (\) in a given input string with the appropriate path separator based on the operating system
 * @param input string to replace
 */
export const replaceSlashes = (input: string): string => {
  return input.replace(/\\/g, path.sep).replace(/\//g, path.sep)
}
