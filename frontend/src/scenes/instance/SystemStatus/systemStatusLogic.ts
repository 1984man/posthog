import api from 'lib/api'
import { kea } from 'kea'
import { systemStatusLogicType } from './systemStatusLogicType'
import { userLogic } from 'scenes/userLogic'
import { SystemStatus, SystemStatusRow, SystemStatusQueriesResult, SystemStatusBackupStatusRow } from '~/types'
import { preflightLogic } from 'scenes/PreflightCheck/logic'

export type TabName = 'overview' | 'internal_metrics'

export const systemStatusLogic = kea<
    systemStatusLogicType<
        SystemStatus,
        SystemStatusRow,
        SystemStatusQueriesResult,
        SystemStatusBackupStatusRow,
        TabName
    >
>({
    actions: {
        setTab: (tab: TabName) => ({ tab }),
        setOpenSections: (sections: string[]) => ({ sections }),
        createBackup: (name: string) => ({ name }),
        restoreFromBackup: (name: string) => ({ name }),
    },
    loaders: {
        systemStatus: [
            null as SystemStatus | null,
            {
                loadSystemStatus: async () => {
                    if (preflightLogic.values.preflight?.cloud && !userLogic.values.user?.is_staff) {
                        return null
                    }
                    return (await api.get('api/instance_status')).results
                },
            },
        ],
        queries: [
            null as SystemStatusQueriesResult | null,
            {
                loadQueries: async () => (await api.get('api/instance_status/queries')).results,
            },
        ],
        backupStatus: [
            [] as SystemStatusBackupStatusRow[],
            {
                loadBackupStatus: async () => (await api.get('api/instance_status/backup_status')).results,
            },
        ],
    },
    reducers: {
        tab: [
            'overview' as TabName,
            {
                setTab: (_, { tab }) => tab,
            },
        ],
        error: [
            null as null | string,
            {
                loadSystemStatusFailure: (_, { error }) => error,
            },
        ],
        openSections: [
            ['0'] as string[],
            { persist: true },
            {
                setOpenSections: (_, { sections }) => sections,
            },
        ],
    },

    selectors: () => ({
        overview: [
            (s) => [s.systemStatus],
            (status: SystemStatus | null): SystemStatusRow[] => (status ? status.overview : []),
        ],
    }),

    listeners: ({ actions }) => ({
        setTab: ({ tab }: { tab: TabName }) => {
            if (tab === 'internal_metrics') {
                actions.loadQueries()
            }
            if (tab === 'backup') {
                actions.loadBackupStatus()
            }
        },
        createBackup: async ({ name }) => {
            console.log(`In createBackup listener with ${name}`)
            //await api.create('http://clickhouse:7171/backup/create?name=${name}')
            await api.create('api/instance_status/create_backup')
        },
        restoreFromBackup: async ({ name }) => {
            console.log(`In restore listener with ${name}`)
            await api.create('api/instance_status/restore_from_backup')
        },
    }),

    events: ({ actions }) => ({
        afterMount: () => {
            actions.loadSystemStatus()
        },
    }),

    actionToUrl: ({ values }) => ({
        setTab: () => '/instance/status' + (values.tab === 'overview' ? '' : '/' + values.tab),
    }),

    urlToAction: ({ actions, values }) => ({
        '/instance/status(/:tab)': ({ tab }: { tab?: TabName }) => {
            const currentTab = tab || 'overview'
            if (currentTab !== values.tab) {
                actions.setTab(currentTab)
            }
        },
    }),
})
