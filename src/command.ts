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
  timeout: 5000,
  delayBetweenTries: 1000,
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

let currentTest: string
let errorMessages: {[key: string]: string} = {}
const matchImageSnapshot =
  (defaultOptionsOverrides: CypressImageSnapshotOptions) =>
  (
    subject: Subject,
    nameOrCommandOptions: CypressImageSnapshotOptions | string,
    commandOptions?: CypressImageSnapshotOptions,
  ) => {
    const {filename, options} = getNameAndOptions(
      nameOrCommandOptions,
      defaultOptionsOverrides,
      commandOptions,
    )
    if (!currentTest) {
      currentTest = Cypress.currentTest.title
    } else if (currentTest !== Cypress.currentTest.title) {
      currentTest = Cypress.currentTest.title
      errorMessages = {}
    }
    function recursiveSnapshot():
      | Cypress.Chainable<DiffSnapshotResult>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      | Cypress.Chainable<DiffSnapshotResult | Cypress.Chainable<any>> {
      const elementToScreenshot = cy.wrap(subject)
      cy.task(MATCH, {
        ...options,
        currentTestTitle: Cypress.currentTest.title,
      })

      const screenshotName = getScreenshotFilename(filename)

      const currentTime = Date.now()
      const hasTimedOut = currentTime - startTime >= Math.abs(options.timeout)

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

        if (added) {
          const message = `New snapshot: '${screenshotName}' was added`
          Cypress.log({name: COMMAND_NAME, message})
          //An after each hook should check if @matchImageSnapshot is defined, if yes it should fail the tests
          cy.wrap(`A new reference Image was created for ${screenshotName}`, {
            log: false,
          }).as('matchImageSnapshot')
          return
        }

        if (!pass && !added && !updated) {
          const message = diffSize
            ? `Image size (${imageDimensions.baselineWidth}x${imageDimensions.baselineHeight}) different than saved snapshot size (${imageDimensions.receivedWidth}x${imageDimensions.receivedHeight}).\nSee diff for details: ${diffOutputPath}`
            : `Image was ${
                diffRatio * 100
              }% different from saved snapshot with ${diffPixelCount} different pixels.\nSee diff for details: ${diffOutputPath}`
          if (hasTimedOut) {
            Cypress.log({name: COMMAND_NAME, message})
            //An after each hook should check if @matchImageSnapshot is defined, if yes it should fail the tests
            errorMessages[screenshotName] = message
          } else {
            Cypress.log({name: COMMAND_NAME, message})
            Cypress.log({
              message: `Attempt ${currentAttempt.toString()}`,
            })
            currentAttempt++
            return cy.wait(options.delayBetweenTries).then(() => {
              return recursiveSnapshot()
            })
          }
        }
      })
    }

    let currentAttempt = 1
    const startTime = Date.now()
    recursiveSnapshot()
    cy.wrap(errorMessages).as('matchImageSnapshot')
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
