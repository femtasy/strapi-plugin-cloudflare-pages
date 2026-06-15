/*
 *
 * HomePage
 *
 */

import React, { memo, useCallback, useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import pluginId from '../../pluginId';
import axiosInstance from '../../utils/axiosInstance';

import { Alert } from '@strapi/design-system/Alert';
import { Badge } from '@strapi/design-system/Badge';
import { Button } from '@strapi/design-system/Button';
import { Dialog, DialogBody, DialogFooter } from '@strapi/design-system/Dialog';
import { Flex } from '@strapi/design-system/Flex';
import { BaseHeaderLayout, ContentLayout } from '@strapi/design-system/Layout';
import { Loader } from '@strapi/design-system/Loader';
import { Main } from '@strapi/design-system/Main';
import { Stack } from '@strapi/design-system/Stack';
import { Table, Thead, Tr, Th, Td, Tbody } from '@strapi/design-system/Table';
import { Typography } from '@strapi/design-system/Typography';
import ExclamationMarkCircle from '@strapi/icons/ExclamationMarkCircle';
import Upload from '@strapi/icons/Upload';

const POLL_INTERVAL_MS = 5000;
const ACTIVE_STATUSES = new Set(['queued', 'initializing', 'running']);

const HomePage = () => {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [isConfirm, setConfirm] = useState(false);
  const [instance, setInstance] = useState(null);
  const [instances, setInstances] = useState([]);
  const [buildStatuses, setBuildStatuses] = useState({});
  const { formatMessage } = useIntl();

  const pollBuildStatuses = useCallback(async (instanceList) => {
    const monitored = instanceList.filter((item) => item.buildMonitor);
    if (!monitored.length) {
      return;
    }

    const results = await Promise.all(
      monitored.map(async (item) => {
        try {
          const response = await axiosInstance.get(`/${pluginId}/status/${item.id}`);
          return [item.id, response.data];
        } catch (err) {
          const message = err.response?.data?.error?.message || err.message;
          return [item.id, { configured: false, build: null, error: message }];
        }
      })
    );

    setBuildStatuses(Object.fromEntries(results));
  }, []);

  useEffect(() => {
    const fetchInstances = async () => {
      const response = await axiosInstance.get(`/${pluginId}`);
      setInstances(response.data.instances);
      setReady(true);
      await pollBuildStatuses(response.data.instances);
    };

    fetchInstances();
  }, [pollBuildStatuses]);

  useEffect(() => {
    if (!ready || !instances.some((item) => item.buildMonitor)) {
      return undefined;
    }

    const interval = setInterval(() => {
      pollBuildStatuses(instances);
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [ready, instances, pollBuildStatuses]);

  const triggerPublish = async () => {
    setError(null);
    setConfirm(false);
    setBusy(true);

    await axiosInstance
      .post(`/${pluginId}/publish`, { id: instance })
      .catch((err) => setError(err.message))
      .finally(() => {
        setBusy(false);
        pollBuildStatuses(instances);
      });
  };

  const handleClick = (id) => {
    setInstance(id);
    setConfirm(true);
  };

  const renderBuildStatus = (item) => {
    if (!item.buildMonitor) {
      return (
        <Typography textColor="neutral500" variant="pi">
          {formatMessage({ id: 'cloudflare-pages.home.status.unconfigured' })}
        </Typography>
      );
    }

    const statusData = buildStatuses[item.id];
    if (!statusData) {
      return <Loader small>{formatMessage({ id: 'cloudflare-pages.home.status.loading' })}</Loader>;
    }

    if (statusData.error) {
      return (
        <Typography textColor="danger600" variant="pi">
          {statusData.error}
        </Typography>
      );
    }

    if (!statusData.build) {
      return <Badge>{formatMessage({ id: 'cloudflare-pages.home.status.idle' })}</Badge>;
    }

    const { build } = statusData;
    return (
      <Stack spacing={1}>
        <Badge active>{formatMessage({ id: 'cloudflare-pages.home.status.active' }, { status: build.status })}</Badge>
        <Typography textColor="neutral600" variant="pi">
          {formatMessage(
            { id: 'cloudflare-pages.home.status.details' },
            {
              branch: build.branch || '-',
              commit: build.commit_hash ? build.commit_hash.slice(0, 7) : '-',
            }
          )}
        </Typography>
      </Stack>
    );
  };

  const isInstanceBusy = (item) => {
    const build = buildStatuses[item.id]?.build;
    return busy || (build && ACTIVE_STATUSES.has(build.status));
  };

  return (
    <Main tabIndex={-1}>
      <BaseHeaderLayout
        title={formatMessage({ id: 'cloudflare-pages.home.title' })}
        subtitle={formatMessage({ id: 'cloudflare-pages.home.description' })}
        as="h2"
      />
      <ContentLayout>
        {!ready ? (
          <Loader small>{formatMessage({ id: 'cloudflare-pages.home.busy' })}</Loader>
        ) : (
          <>
            {error && (
              <Alert title="Error" closeLabel="Close" onClose={() => setError(null)} variant="danger">
                {error}
              </Alert>
            )}

            <Table colCount={3} rowCount={instances.length + 1}>
              <Thead>
                <Tr>
                  <Th>
                    <Typography variant="sigma" textColor="neutral600">
                      {formatMessage({ id: 'cloudflare-pages.home.prompt' })}
                    </Typography>
                  </Th>
                  <Th>
                    <Typography variant="sigma" textColor="neutral600">
                      {formatMessage({ id: 'cloudflare-pages.home.status.column' })}
                    </Typography>
                  </Th>
                  <Th>
                    <Typography variant="sigma" textColor="neutral600">
                      {formatMessage({ id: 'cloudflare-pages.home.action.column' })}
                    </Typography>
                  </Th>
                </Tr>
              </Thead>
              <Tbody>
                {instances.map((item) => (
                  <Tr key={item.id}>
                    <Td>
                      <Typography textColor="neutral800">{item.name}</Typography>
                    </Td>
                    <Td>{renderBuildStatus(item)}</Td>
                    <Td>
                      {busy && instance === item.id ? (
                        <Loader small>{formatMessage({ id: 'cloudflare-pages.home.busy' })}</Loader>
                      ) : (
                        <Button
                          variant="default"
                          startIcon={<Upload />}
                          onClick={() => handleClick(item.id)}
                          disabled={isInstanceBusy(item)}
                        >
                          {formatMessage(
                            { id: 'cloudflare-pages.home.button.publish' },
                            { instance: item.name }
                          )}
                        </Button>
                      )}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </>
        )}
        <Dialog
          onClose={() => setConfirm(false)}
          title={formatMessage({ id: 'cloudflare-pages.home.prompt.confirm.title' })}
          isOpen={isConfirm}
        >
          <DialogBody icon={<ExclamationMarkCircle />}>
            <Stack spacing={2}>
              <Flex justifyContent="center">
                <Typography id="confirm-description">
                  {formatMessage({ id: 'cloudflare-pages.home.prompt.confirm.description' })}
                </Typography>
              </Flex>
            </Stack>
          </DialogBody>
          <DialogFooter
            startAction={
              <Button onClick={() => setConfirm(false)} variant="tertiary">
                {formatMessage({ id: 'cloudflare-pages.home.prompt.confirm.cancel' })}
              </Button>
            }
            endAction={
              <Button onClick={() => triggerPublish()} variant="danger-light" startIcon={<Upload />}>
                {formatMessage({ id: 'cloudflare-pages.home.prompt.confirm.ok' })}
              </Button>
            }
          />
        </Dialog>
      </ContentLayout>
    </Main>
  );
};

export default memo(HomePage);
