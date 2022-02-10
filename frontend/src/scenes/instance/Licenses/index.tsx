import React, { useEffect } from 'react'
import { Alert, Form, Button, Table, Input } from 'antd'
import { licenseLogic } from './logic'
import { useValues, useActions } from 'kea'
import { humanFriendlyDetailedTime, humanFriendlyNumber } from 'lib/utils'
import { CodeSnippet } from 'scenes/ingestion/frameworks/CodeSnippet'
import { PageHeader } from 'lib/components/PageHeader'
import { InfoCircleOutlined } from '@ant-design/icons'
import { Tooltip } from 'lib/components/Tooltip'
import { SceneExport } from 'scenes/sceneTypes'
import { LicenseType } from '~/types'

export const scene: SceneExport = {
    component: Licenses,
    logic: licenseLogic,
}

export function isLicenseExpired(license: LicenseType): boolean {
    return new Date(license.valid_until) < new Date()
}

const columns = [
    {
        title: 'Active',
        render: function renderActive(license: any) {
            return isLicenseExpired(license) ? 'expired' : 'active'
        },
    },
    {
        title: 'Valid until',
        render: function renderActive(license: any) {
            return humanFriendlyDetailedTime(license.valid_until)
        },
    },
    {
        title: 'Plan',
        dataIndex: 'plan',
    },
    {
        title: function Render() {
            return (
                <Tooltip
                    placement="right"
                    title="Maximum number of team members that you can have across all organizations with your current license."
                >
                    Max # of team members
                    <InfoCircleOutlined className="info-indicator" />
                </Tooltip>
            )
        },
        render: function renderMaxUsers(license: any) {
            return license.max_users === null ? 'Unlimited' : license.max_users
        },
    },
    {
        title: 'Key',
        render: function renderActive(license: any) {
            return <CodeSnippet>{license.key}</CodeSnippet>
        },
    },
    {
        title: 'License added on',
        render: function renderActive(license: any) {
            return humanFriendlyDetailedTime(license.created_at)
        },
    },
]

export function Licenses(): JSX.Element {
    const [form] = Form.useForm()
    const { licenses, licensesLoading, error, billableUsage } = useValues(licenseLogic)
    const { createLicense, loadUsage } = useActions(licenseLogic)

    useEffect(() => {
        loadUsage()
    }, [])
    return (
        <div>
            <PageHeader
                title="Licenses"
                caption={
                    <>
                        Here you can add and manage your PostHog enterprise licenses. When you activate a license key,
                        enterprise functionality will be enabled immediately.{' '}
                        <a href="https://posthog.com/pricing" target="_blank">
                            Click here
                        </a>{' '}
                        to grab a license key (first 1 million events free!). Contact{' '}
                        <a href="mailto:sales@posthog.com">sales@posthog.com</a> if you have any issues buying or
                        activating your license.
                        {billableUsage.usage > 0 && !licensesLoading && (
                            <p>
                                <br />
                                {licenses.length === 0
                                    ? "When you activate a license, you'll be billed based on usage. "
                                    : 'You are billed based on usage. '}
                                To give you an indication, you've used{' '}
                                <strong>{humanFriendlyNumber(billableUsage.usage)}</strong> events in the last 30 days.
                                The exact amount you are billed depends on the day you subscribed for a license.
                            </p>
                        )}
                    </>
                }
            />
            {error && (
                <Alert
                    message={
                        error.detail || <span>Could not validate license key. Please try again or contact us.</span>
                    }
                    type="error"
                    style={{ marginBottom: '1em' }}
                />
            )}
            <Form
                form={form}
                name="horizontal_login"
                layout="inline"
                onFinish={(values) => createLicense({ key: values.key })}
                style={{ marginBottom: '1rem' }}
            >
                <Form.Item name="key" rules={[{ required: true, message: 'Please input a license key!' }]}>
                    <Input placeholder="License key" style={{ minWidth: 400 }} />
                </Form.Item>
                <Form.Item shouldUpdate={true}>
                    {() => (
                        <Button
                            type="primary"
                            htmlType="submit"
                            disabled={
                                !form.isFieldsTouched(true) ||
                                !!form.getFieldsError().filter(({ errors }) => errors.length).length
                            }
                        >
                            Activate License Key
                        </Button>
                    )}
                </Form.Item>
            </Form>
            <Table
                data-attr="license-table"
                size="small"
                rowKey="id"
                pagination={false}
                rowClassName="cursor-pointer"
                dataSource={licenses}
                columns={columns}
                loading={licensesLoading}
            />
        </div>
    )
}
