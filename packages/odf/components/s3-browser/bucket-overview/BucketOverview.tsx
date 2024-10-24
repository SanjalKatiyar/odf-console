import * as React from 'react';
import { BucketDetails } from '@odf/core/components/s3-browser/bucket-details/BucketDetails';
import PageHeading from '@odf/shared/heading/page-heading';
import { useRefresh } from '@odf/shared/hooks';
import { ModalKeys, defaultModalMap } from '@odf/shared/modals/types';
import { BlueSyncIcon } from '@odf/shared/status';
import { K8sResourceKind } from '@odf/shared/types';
import { useCustomTranslation } from '@odf/shared/useCustomTranslationHook';
import {
  referenceForModel,
  getValidWatchK8sResourceObj,
} from '@odf/shared/utils';
import { YAMLEditorWrapped } from '@odf/shared/utils/Tabs';
import {
  useK8sWatchResource,
  HorizontalNav,
  useModal,
  K8sResourceCommon,
} from '@openshift-console/dynamic-plugin-sdk';
import { LaunchModal } from '@openshift-console/dynamic-plugin-sdk/lib/app/modal-support/ModalProvider';
import { TFunction } from 'i18next';
import { useNavigate, NavigateFunction } from 'react-router-dom-v5-compat';
import { useParams, useSearchParams } from 'react-router-dom-v5-compat';
import { Button, ButtonVariant } from '@patternfly/react-core';
import { ActionsColumn, IAction } from '@patternfly/react-table';
import { PREFIX, BUCKETS_BASE_ROUTE } from '../../../constants';
import { NooBaaObjectBucketModel } from '../../../models';
import { getBreadcrumbs } from '../../../utils';
import { NoobaaS3Provider } from '../noobaa-context';
import { CustomActionsToggle } from '../objects-list';
import { ObjectListWithSidebar } from '../objects-list/ObjectListWithSidebar';
import { PageTitle } from './PageTitle';

type CustomYAMLEditorProps = {
  obj: {
    resource: K8sResourceCommon;
  };
};

const CustomYAMLEditor: React.FC<CustomYAMLEditorProps> = ({
  obj: { resource },
}) => <YAMLEditorWrapped obj={resource} />;

const getBucketActionsItems = (
  t: TFunction,
  launcher: LaunchModal,
  navigate: NavigateFunction,
  bucketName: string,
  isCreatedByOBC: boolean,
  noobaaObjectBucket: K8sResourceKind
): IAction[] => [
  // ToDo: add empty/delete bucket actions
  {
    title: t('Empty bucket'),
    onClick: () => undefined,
  },
  {
    title: t('Delete bucket'),
    onClick: () => undefined,
  },
  ...(isCreatedByOBC
    ? [
        {
          title: t('Edit labels'),
          onClick: () =>
            launcher(defaultModalMap[ModalKeys.EDIT_LABELS], {
              extraProps: {
                resource: noobaaObjectBucket,
                resourceModel: NooBaaObjectBucketModel,
              },
              isOpen: true,
            }),
        },
        {
          title: t('Edit annotations'),
          onClick: () =>
            launcher(defaultModalMap[ModalKeys.EDIT_ANN], {
              extraProps: {
                resource: noobaaObjectBucket,
                resourceModel: NooBaaObjectBucketModel,
              },
              isOpen: true,
            }),
        },
        {
          title: t('Edit bucket'),
          onClick: () => navigate(`${BUCKETS_BASE_ROUTE}/${bucketName}/yaml`),
        },
      ]
    : []),
];

const BucketOverview: React.FC<{}> = () => {
  const { t } = useCustomTranslation();
  const [fresh, triggerRefresh] = useRefresh();

  const launcher = useModal();
  const navigate = useNavigate();

  const { bucketName } = useParams();
  const [searchParams] = useSearchParams();

  // if non-empty means we are inside particular folder(s) of a bucket, else just inside a bucket (top-level)
  const foldersPath = searchParams.get(PREFIX);

  const [objectBuckets, objectBucketsLoaded, objectBucketsError] =
    useK8sWatchResource<K8sResourceKind[]>(
      getValidWatchK8sResourceObj(
        {
          kind: referenceForModel(NooBaaObjectBucketModel),
          namespaced: false,
          isList: true,
        },
        !foldersPath
      )
    );
  const noobaaObjectBucket: K8sResourceKind = objectBuckets?.find(
    (ob) => ob.spec?.endpoint?.bucketName === bucketName
  );
  // denotes whether bucket is created via OBC or S3 endpoint (will be false if we are inside folder view)
  const isCreatedByOBC = !!noobaaObjectBucket;

  const { breadcrumbs, currentFolder } = React.useMemo(
    () => getBreadcrumbs(foldersPath, bucketName, t),
    [foldersPath, bucketName, t]
  );

  const navPages = [
    {
      href: '',
      name: t('Objects'),
      component: ObjectListWithSidebar,
    },
    ...(!foldersPath
      ? [
          {
            href: 'details',
            name: t('Details'),
            component: BucketDetails,
          },
        ]
      : []),
    ...(isCreatedByOBC
      ? [
          {
            href: 'yaml',
            name: t('YAML'),
            component: CustomYAMLEditor,
          },
        ]
      : []),
  ];

  const actions = () => {
    return (
      <>
        <Button
          className="pf-v5-u-mr-md pf-v5-u-mb-xs"
          variant={ButtonVariant.link}
          icon={<BlueSyncIcon />}
          onClick={triggerRefresh}
          isDisabled={!fresh}
          isInline
        >
          {t('Refresh')}
        </Button>
        {!foldersPath && (
          <ActionsColumn
            items={getBucketActionsItems(
              t,
              launcher,
              navigate,
              bucketName,
              isCreatedByOBC,
              noobaaObjectBucket
            )}
            actionsToggle={CustomActionsToggle}
          />
        )}
      </>
    );
  };

  return (
    <NoobaaS3Provider loading={!objectBucketsLoaded} error={objectBucketsError}>
      <PageHeading
        breadcrumbs={breadcrumbs}
        title={
          <PageTitle
            bucketName={bucketName}
            foldersPath={foldersPath}
            currentFolder={currentFolder}
            isCreatedByOBC={isCreatedByOBC}
            noobaaObjectBucket={noobaaObjectBucket}
          />
        }
        actions={actions}
        className="pf-v5-u-mt-md"
      />
      <HorizontalNav
        pages={navPages}
        resource={
          {
            refresh: fresh,
            triggerRefresh,
            resource: noobaaObjectBucket,
          } as any
        }
      />
    </NoobaaS3Provider>
  );
};

export default BucketOverview;
