import * as React from 'react';
import { useSafeK8sGet } from '@odf/core/hooks';
import { useODFNamespaceSelector } from '@odf/core/redux';
import { StatusBox } from '@odf/shared/generic/status-box';
import { SecretModel, RouteModel } from '@odf/shared/models';
import { S3Commands } from '@odf/shared/s3';
import { SecretKind, K8sResourceKind } from '@odf/shared/types';
import * as _ from 'lodash-es';
import {
  NOOBAA_ADMIN_SECRET,
  NOOBAA_S3_ROUTE,
  NOOBAA_ACCESS_KEY_ID,
  NOOBAA_SECRET_ACCESS_KEY,
} from '../../constants';

type NoobaaS3ContextType = {
  noobaaS3: S3Commands;
};

type NoobaaS3ProviderType = {
  loading?: boolean;
  error?: unknown;
};

export const NoobaaS3Context = React.createContext<NoobaaS3ContextType>(
  {} as NoobaaS3ContextType
);

// ToDo: In case this provider is needed at too many places, consider applying it to the console's root or use redux instead
export const NoobaaS3Provider: React.FC<NoobaaS3ProviderType> = ({
  children,
  loading,
  error,
}) => {
  const { isODFNsLoaded, odfNsLoadError } = useODFNamespaceSelector();

  const [secretData, secretLoaded, secretError] = useSafeK8sGet<SecretKind>(
    SecretModel,
    NOOBAA_ADMIN_SECRET
  );
  // ToDo: Configure ConsolePlugin proxy instead of using Route
  const [routeData, routeLoaded, routeError] = useSafeK8sGet<K8sResourceKind>(
    RouteModel,
    NOOBAA_S3_ROUTE
  );

  const [noobaaS3, noobaaS3Error]: [S3Commands, unknown] = React.useMemo(() => {
    if (!_.isEmpty(secretData) && !_.isEmpty(routeData)) {
      try {
        // ToDo: Remove this once ConsolePlugin proxy is configured
        const endpoint = `https://${routeData.spec.host}`;
        const accessKeyId = atob(secretData.data?.[NOOBAA_ACCESS_KEY_ID]);
        const secretAccessKey = atob(
          secretData.data?.[NOOBAA_SECRET_ACCESS_KEY]
        );

        return [new S3Commands(endpoint, accessKeyId, secretAccessKey), null];
      } catch (err) {
        return [{} as S3Commands, err];
      }
    }
    return [{} as S3Commands, null];
  }, [secretData, routeData]);

  const allLoaded =
    isODFNsLoaded &&
    secretLoaded &&
    routeLoaded &&
    !loading &&
    !_.isEmpty(noobaaS3);
  const anyError =
    odfNsLoadError || secretError || routeError || noobaaS3Error || error;

  return allLoaded && !anyError ? (
    <NoobaaS3Context.Provider value={{ noobaaS3 }}>
      {children}
    </NoobaaS3Context.Provider>
  ) : (
    <StatusBox loaded={allLoaded} loadError={anyError} />
  );
};
