import {XrayOptions, XrayImportOptions} from './processor'
import got from 'got'
import * as core from '@actions/core'
import FormData from 'form-data'
import {doFormDataRequest} from './utils'
import {createSearchParams, updateTestExecJson} from './xray-utils'
import {Xray} from './xray'

export class XrayServer implements Xray {
  xrayProtocol = 'https'
  protocol: 'https:' | 'http:'
  xrayBaseUrl = 'sandbox.xpand-it.com'
  searchParams!: URLSearchParams
  token = ''

  constructor(
    private xrayOptions: XrayOptions,
    private xrayImportOptions: XrayImportOptions
  ) {
    this.xrayBaseUrl = this.xrayOptions.baseUrl
    this.searchParams = createSearchParams(this.xrayImportOptions)

    if (this.xrayProtocol === 'https') {
      this.protocol = 'https:'
    } else {
      this.protocol = 'http:'
    }
  }

  async auth(): Promise<void> {
    // no auth needed
  }

  updateTestExecKey(testExecKey: string): void {
    this.xrayImportOptions.testExecKey = testExecKey
    this.searchParams = createSearchParams(this.xrayImportOptions)
  }

  async import(data: Buffer, mimeType: string): Promise<string> {
    // do import
    let format = this.xrayImportOptions.testFormat
    if (format === 'xray') {
      format = '' // xray format has no subpath
    }

    if (
      this.xrayImportOptions.testExecutionJson &&
      this.xrayImportOptions.testExecKey === ''
    ) {
      const form = new FormData()
      updateTestExecJson(
        this.xrayImportOptions,
        this.xrayImportOptions.testExecutionJson
      )
      form.append(
        'info',
        JSON.stringify(this.xrayImportOptions.testExecutionJson),
        {
          contentType: 'application/json',
          filename: 'info.json',
          filepath: 'info.json'
        }
      )
      form.append('file', data.toString('utf-8'), {
        contentType: mimeType,
        filename: 'report.xml',
        filepath: 'report.xml'
      })
      form.append(
        'testInfo',
        JSON.stringify({
          fields: {
            project: {
              key: this.xrayImportOptions.projectKey
            }
          }
        }),
        {
          contentType: 'application/json',
          filename: 'testInfo.json',
          filepath: 'testInfo.json'
        }
      )

      core.debug(
        `Using multipart endpoint: ${this.xrayProtocol}://${this.xrayBaseUrl}/rest/raven/2.0/import/execution/${format}/multipart`
      )

      const importResponse = await doFormDataRequest(form, {
        protocol: this.protocol,
        host: this.xrayBaseUrl,
        auth: `${this.xrayOptions.username}:${this.xrayOptions.password}`,
        path: `/rest/raven/2.0/import/execution/${format}/multipart`
      })
      try {
        return importResponse.testExecIssue.key
      } catch (error) {
        core.warning(
          `🔥 Response did not match expected format: ${JSON.stringify(
            importResponse
          )}`
        )
        return ''
      }
    } else {
      if (mimeType === 'application/xml') {
        const form = new FormData()
        form.append('file', data.toString('utf-8'), {
          contentType: mimeType,
          filename: 'report.xml',
          filepath: 'report.xml'
        })

        const importResponse = await doFormDataRequest(form, {
          protocol: this.protocol,
          host: this.xrayBaseUrl,
          auth: `${this.xrayOptions.username}:${this.xrayOptions.password}`,
          path: `/rest/raven/2.0/import/execution/${format}?${this.searchParams.toString()}`
        })
        try {
          return importResponse.testExecIssue.key
        } catch (error) {
          core.warning(
            `🔥 Response did not match expected format: ${JSON.stringify(
              importResponse
            )}`
          )
          return ''
        }
      } else {
        const endpoint = `${this.xrayProtocol}://${this.xrayBaseUrl}/rest/raven/2.0/import/execution/${format}`
        core.debug(`Using endpoint: ${endpoint}`)

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const importResponse = await got.post<any>(endpoint, {
          searchParams: this.searchParams,
          headers: {
            Authorization: `Basic ${Buffer.from(
              `${this.xrayOptions.username}:${this.xrayOptions.password}`
            ).toString('base64')}`,
            'Content-Type': mimeType
          },
          body: data,
          responseType: 'json',
          timeout: 60000 // 60s timeout
        })
        try {
          return importResponse.body.testExecIssue.key
        } catch (error) {
          core.warning(
            `🔥 Response did not match expected format: ${JSON.stringify(
              importResponse.body || importResponse
            )}`
          )
          return ''
        }
      }
    }
  }
}
