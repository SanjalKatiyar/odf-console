# Scale, SAN, and LUNs - Comprehensive Explanation

## Overview

ODF (OpenShift Data Foundation) supports **External StorageSystems**, which allow you to connect to external storage solutions. Two key external storage types are:

1. **IBM Scale (CNSA)** - External remote Scale cluster (Cloud Native Storage Access)
2. **SAN (Storage Area Network)** - Local SAN storage using LUNs

Both use IBM Spectrum Scale technology but in different ways.

---

## Key Concepts

### What is Scale (CNSA)?

**IBM Spectrum Scale** (also called "Scale" or "CNSA" - Cloud Native Storage Access) is IBM's parallel file system software. In ODF, "Scale" refers to connecting to an **external/remote** IBM Spectrum Scale cluster that already exists outside your Kubernetes cluster.

### What is SAN?

**SAN (Storage Area Network)** uses **LUNs (Logical Unit Numbers)** - shared block storage devices from external SAN storage arrays. SAN in ODF:

- Uses **external** SAN storage arrays (the storage infrastructure is outside Kubernetes)
- Creates a **local** IBM Spectrum Scale cluster within your Kubernetes cluster to manage the LUNs
- Does **NOT** connect to a remote Scale cluster - it's completely self-contained

**Why is SAN called "external"?**

- The **storage source** (LUNs from SAN arrays) is external to Kubernetes
- It's not the native ODF storage solution (like Ceph)
- The storage infrastructure is managed outside of ODF/Kubernetes
- However, the Scale software runs **locally** in your cluster

### What are LUNs?

**LUNs (Logical Unit Numbers)** are block storage devices (disks) that are:

- Shared across multiple nodes in your cluster
- Discovered from SAN storage arrays via the Device Finder service
- Grouped together to create filesystems (LUN groups)
- Used to create StorageClasses for provisioning persistent volumes

---

## Relationship Between Scale, SAN, and LUNs

```
┌─────────────────────────────────────────────────────────────┐
│                    External Storage Systems                  │
└─────────────────────────────────────────────────────────────┘
                              │
                ┌─────────────┴─────────────┐
                │                           │
        ┌───────▼───────┐         ┌────────▼────────┐
        │  Scale (CNSA) │         │  SAN (Local)    │
        │               │         │                  │
        │ Remote Cluster│         │ Local Cluster   │
        │ (External)    │         │ (In-cluster)    │
        └───────────────┘         └────────┬────────┘
                                           │
                                    ┌──────▼──────┐
                                    │    LUNs     │
                                    │  (Block    │
                                    │  Devices)   │
                                    └─────────────┘
```

**Key Differences:**

| Aspect               | Scale (CNSA)                                         | SAN                                                             |
| -------------------- | ---------------------------------------------------- | --------------------------------------------------------------- |
| **Location**         | External/Remote cluster                              | Local (within Kubernetes cluster)                               |
| **Setup**            | Connect to existing Scale cluster                    | Create new local Scale cluster                                  |
| **Storage**          | Uses remote filesystems                              | Uses local LUNs (block devices)                                 |
| **Storage Source**   | External Scale cluster                               | External SAN storage arrays                                     |
| **Scale Connection** | Connects to remote Scale                             | **No remote connection** - standalone local cluster             |
| **Use Case**         | Connect to existing Scale infrastructure             | Use SAN storage arrays with LUNs                                |
| **CRs Created**      | RemoteCluster, Filesystem (remote), EncryptionConfig | Cluster (local), LocalDisk, Filesystem (local)                  |
| **Why "External"?**  | Storage is external (remote Scale)                   | Storage source is external (SAN arrays), but Scale runs locally |

---

## Why SAN Needs Local Scale Cluster

**Key Question: Why does SAN need a local Scale cluster if LUNs are already available?**

### The Problem with Raw LUNs

- **LUNs are just raw block devices** - they don't have a filesystem
- Kubernetes needs a **CSI driver** to provision PersistentVolumes
- Raw block devices can't provide:
  - Distributed/parallel filesystem capabilities
  - High availability and replication
  - Volume provisioning and management
  - Multi-node access coordination

### What Local Scale Provides

1. **Filesystem Layer**: Creates a distributed filesystem from raw LUNs
2. **CSI Driver**: `spectrumscale.csi.ibm.com` enables Kubernetes volume provisioning
3. **Scale Daemons**: Run locally on nodes to:
   - Manage the filesystem
   - Handle replication (1-way, 2-way, 3-way)
   - Coordinate multi-node access
   - Provide high availability
4. **StorageClass Support**: Enables dynamic volume provisioning

### Important: SAN Does NOT Connect to Remote Scale

- **SAN is completely self-contained** - no connection to external Scale clusters
- The local Scale cluster is created **only** to manage the LUNs
- It's a **standalone** Scale cluster running in your Kubernetes cluster
- The "external" in "external storage system" refers to the **storage source** (SAN arrays), not the Scale software

### Architecture Comparison

```
┌─────────────────────────────────────────────────────────────────┐
│                    SCALE / CNSA (External System)                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Kubernetes Cluster                                            │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  Cluster CR ("ibm-spectrum-scale")  [namespaced]         │ │
│  │  RemoteCluster CR                                        │ │
│  │  Filesystem CR (remote)                                  │ │
│  │  └─> Connects to ────────────────────────┐              │ │
│  └───────────────────────────────────────────┼──────────────┘ │
│                                               │                │
│                                               ▼                │
│                                    ┌──────────────────────┐   │
│                                    │ External Scale       │   │
│                                    │ Cluster (Remote)     │   │
│                                    │ - Already exists     │   │
│                                    │ - Outside K8s        │   │
│                                    └──────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    SAN (External System)                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Kubernetes Cluster                                            │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  Cluster CR ("ibm-spectrum-scale")  [namespaced]         │ │
│  │  ┌────────────────────────────────────────────────────┐   │ │
│  │  │  Scale Daemon Pods (local)                        │   │ │
│  │  │  - Manage filesystem                               │   │ │
│  │  │  - Handle replication                              │   │ │
│  │  └────────────────────────────────────────────────────┘   │ │
│  │  CSI Driver: spectrumscale.csi.ibm.com                     │ │
│  │                                                              │ │
│  │  LocalDisk CRs ──> Filesystem CR (local)                    │ │
│  │       │                    │                                 │ │
│  │       └────────────────────┘                                 │ │
│  └──────────────────────────────────────────────────────────┘ │
│         │                                                       │
│         │ Uses                                                 │
│         ▼                                                       │
│  ┌──────────────────────┐                                      │
│  │ External SAN Arrays  │  ← "External" storage source         │
│  │ - LUNs (block devs) │     (not managed by K8s/ODF)        │
│  │ - Outside K8s       │                                      │
│  └──────────────────────┘                                      │
│                                                                 │
│  NO connection to remote Scale cluster                      │
│  Local Scale cluster is standalone                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## Custom Resources (CRs) in `packages/shared/src/models/scale.ts`

All CRs belong to the API group: `scale.spectrum.ibm.com/v1beta1`

**Important**: All Scale CRs are **namespaced** (not cluster-scoped). The default namespace is `ibm-spectrum-scale`.

### 1. **Cluster** (`ClusterModel`)

- **Purpose**: Represents a **local** IBM Spectrum Scale cluster within your Kubernetes cluster
- **When Created**:
  - When setting up **SAN** or **Scale** storage (whichever is first)
  - Used to manage local Scale daemons and configuration
  - **Only one local cluster is created** - reused for all SAN LUN groups and Scale connections
- **Used By**:
  - Both SAN and Scale setup
  - Both dashboards reference it
- **Key Fields**:
  - `spec.license`: License acceptance (`{ accept: true, license: 'data-management' }`)
  - `spec.daemon.nodeSelector`: Node selector for daemon pods (`scale.spectrum.ibm.com/daemon-selector: ''`)
  - `spec.daemon.clusterProfile`: Performance tuning parameters
  - `spec.daemon.roles`: Role definitions (afm, storage, client)
  - `spec.daemon.resources`: CPU/memory resource requests (calculated from node resources)
  - `spec.grafanaBridge`: Grafana Bridge config (`{ enablePrometheusExporter: true }`)
  - `spec.gpfsModuleManagement`: KMM (Kernel Module Management) configuration (optional, SAN only when no persistent registry)
  - `spec.gui`: GUI configuration
  - `spec.csi`: CSI configuration
  - `spec.networkPolicy`: Network policy configuration
  - `spec.debugConfig`: Debug configuration
- **Namespace**: Namespaced (typically `ibm-spectrum-scale`)
- **Name**: `IBM_SCALE_LOCAL_CLUSTER_NAME` = `"ibm-spectrum-scale"`
- **Note**: This is a **local** cluster - it does NOT connect to any remote Scale cluster

**Code Location**: `packages/odf/components/create-storage-system/external-systems/common/payload.ts`

---

### 2. **RemoteCluster** (`RemoteClusterModel`)

- **Purpose**: Represents a connection to an **external/remote** IBM Spectrum Scale cluster
- **When Created**:
  - When setting up **Scale (CNSA)** external system (connecting to remote Scale)
  - Contains connection details (hosts, credentials, certificates)
- **Used By**:
  - Scale external system setup (`CreateScaleSystem`)
  - Used to reference remote filesystems
- **Key Fields**:
  - `spec.gui.hosts`: Array of hostnames/IPs of remote Scale cluster (max 3)
  - `spec.gui.secretName`: Secret containing username/password
  - `spec.gui.cacert`: CA certificate ConfigMap name (optional)
  - `spec.gui.port`: Port number (number type, parsed from string input)
  - `spec.gui.insecureSkipVerify`: Set to `true` when no CA cert provided, `false` otherwise
  - `spec.gui.passwordRotation`: Password rotation config (empty object `{}` by default)
  - `spec.gui.scheme`: Connection scheme (default: `'https'`)
  - `spec.gui.csiSecretName`: CSI secret name (optional)
  - `spec.contactNodes`: Contact node list (optional)
- **Namespace**: Namespaced (typically `ibm-spectrum-scale`)

**Code Location**: `packages/odf/components/create-storage-system/external-systems/CreateScaleSystem/payload.ts`

---

### 3. **Filesystem** (`FileSystemModel`)

- **Purpose**: Represents a filesystem that can be either:
  - **Local**: Created from LUNs (SAN setup)
  - **Remote**: Referenced from external Scale cluster (Scale setup)
- **Kind**: `Filesystem` (lowercase 's' - **not** `FileSystem`)
- **When Created**:
  - **SAN**: When creating a LUN group (local filesystem from LUNs)
  - **Scale**: When connecting to a remote filesystem
- **Used By**:
  - Both SAN and Scale systems
  - Used to create StorageClasses
- **Key Fields**:
  - `spec.local`: For SAN (local filesystem from LUNs)
    - `blockSize`: Filesystem block size (e.g., `'4M'`) - **at the `local` level**, not inside pools
    - `pools`: Disk pools with disk references (array of `{ name: string, disks: string[] }`)
    - `replication`: Replication factor (`'1-way'`, `'2-way'`, `'3-way'`)
    - `type`: `'shared'` or `'unshared'`
  - `spec.remote`: For Scale (remote filesystem reference)
    - `cluster`: Name of RemoteCluster
    - `fs`: Name of filesystem on remote cluster
  - `spec.seLinuxOptions`: SELinux security context (set on Scale remote filesystems)
    - `{ level: 's0', role: 'object_r', type: 'container_file_t', user: 'system_u' }`
  - `spec.vdiskNSD`: Virtual disk NSD configuration (optional, advanced)
  - `status.conditions`: Health/status conditions
  - `status.pools`: Pool status with disk counts and sizes
  - `status.maintenanceMode`: Maintenance mode status
- **Namespace**: Namespaced (typically `ibm-spectrum-scale`)

**Code Locations**:

- SAN: `packages/odf/components/create-storage-system/external-systems/CreateSANSystem/payload.ts`
- Scale: `packages/odf/components/create-storage-system/external-systems/CreateScaleSystem/payload.ts`
- Types: `packages/odf/types/scale.ts` (`FileSystemKind`)

---

### 4. **LocalDisk** (`LocalDiskModel`)

- **Purpose**: Represents a discovered LUN/block device that will be used to create a local filesystem
- **When Created**:
  - **SAN setup only**: When user selects LUNs to create a LUN group
  - Created for each selected LUN
- **Used By**:
  - SAN system (`CreateSANSystem`)
  - Referenced by Filesystem CR in `spec.local.pools[].disks[]`
- **Key Fields (spec)**:
  - `spec.device`: Device path (e.g., `/dev/sdb`)
  - `spec.node`: Kubernetes node name where the device was discovered
  - `spec.existingDataSkipVerify`: Skip verification of existing data (optional)
  - `spec.failureGroup`: Failure group number (optional)
  - `spec.nodeConnectionSelector`: Label selector for nodes with physical access (optional)
  - `spec.thinDiskType`: Space reclaim type - `'no'`, `'nvme'`, `'scsi'`, `'auto'` (optional)
- **Key Fields (status)**:
  - `status.size`: Size of the local disk
  - `status.type`: Connectivity type - `'shared'`, `'partially-shared'`, `'unshared'`
  - `status.filesystem`: Filesystem using this disk
  - `status.pool`: Filesystem pool using this disk
  - `status.nodeConnections`: Nodes with physical connection
  - `status.failuregroup`: Assigned failure group number
- **Additional payload fields**: The creation payload also sends `wwn` (World Wide Name) and `capacity` (disk size as string) which are not in the formal TypeScript type
- **Namespace**: Namespaced (typically `ibm-spectrum-scale`)
- **Name Pattern**: `localdisk-{WWN}` (e.g., `localdisk-600508b400c85c7f0000e00010250000`)
- **Labels**: `{ discovered: 'true' }`

**Code Location**: `packages/odf/components/create-storage-system/external-systems/CreateSANSystem/payload.ts`

---

### 5. **EncryptionConfig** (`EncryptionConfigModel`)

- **Purpose**: Configuration for encryption at rest using external key management servers
- **When Created**:
  - **Scale setup only**: When encryption is enabled during Scale external system setup
  - Optional feature (checkbox in the form)
- **Used By**:
  - Scale external system with encryption enabled
- **Key Fields**:
  - `spec.server`: Key management server address
  - `spec.tenant`: Tenant ID (maxLength: 16)
  - `spec.client`: Client ID (maxLength: 16)
  - `spec.secret`: Secret name containing credentials (actually the encryption password in current code)
  - `spec.cacert`: CA certificate ConfigMap name (optional)
  - `spec.port`: Key management server port (default: 9443)
  - `spec.filesystems`: List of filesystems to encrypt with algorithm (optional)
  - `spec.backupServers`: Backup server list (maxItems: 5, optional)
  - `spec.remoteRKM`: Remote RKM identifier (maxLength: 21, optional)
- **Namespace**: Namespaced (typically `ibm-spectrum-scale`)

**Code Location**: `packages/odf/components/create-storage-system/external-systems/CreateScaleSystem/payload.ts`

---

### 6. **Daemon** (`DaemonModel`)

- **Purpose**: Represents IBM Spectrum Scale daemon configuration (low-level Scale configuration)
- **When Created**:
  - **Not directly created by ODF console**
  - Created/managed by IBM Spectrum Scale operator
  - Used internally by Scale operator to manage Scale core pods
- **Used By**:
  - IBM Spectrum Scale operator (not directly by ODF console)
  - Contains advanced configuration for Scale daemon pods
- **Key Fields**:
  - `spec.edition`: Scale edition (`'data-access'`, `'data-management'`, `'erasure-code'`)
  - `spec.site`: Site name and DNS zone
  - `spec.roles`: Role definitions (afm, storage, client)
  - `spec.clusterProfile`: Advanced performance tuning
  - `spec.nodeSelector`: Node selector for daemon pods
  - `spec.update`: Rolling update configuration with pool support
- **Note**: This CR is defined in the models but not actively created by the ODF console UI. It's managed by the Scale operator.
- **Namespace**: Namespaced

---

## Workflow: How CRs Are Created

### SAN Setup Workflow

```
1. User selects nodes, optionally selects LUNs and provides LUN group name
   ↓
2. If local Cluster CR doesn't exist:
   a. Label selected nodes with scale.spectrum.ibm.com/daemon-selector
   b. Build ExternalKMMRegistryConfig (if no persistent image registry exists):
      - imageRegistryUrl, imageRepositoryName, secretKey
      - Optional: caCertificateSecret, privateKeySecret (for secure boot)
   c. Calculate optimal resource requests from node specs:
      - CPU: max(ceil(minNodeCPU * 5%), 2 cores)
      - Memory: max(ceil(minNodeMemory * 5%), 6Gi)
   d. Create Cluster CR ("ibm-spectrum-scale")
      - Local Scale cluster configuration
      - Sets daemon nodeSelector, clusterProfile, license
      - Includes gpfsModuleManagement.kmm config if needed
      - Includes resource requests for daemon pods
   e. Create CSI Driver (spectrumscale.csi.ibm.com)
      - Enables Kubernetes volume provisioning
   f. Configure metrics namespace labels:
      - Label openshift-user-workload-monitoring namespace
      - Remove cluster-monitoring label from ibm-spectrum-scale namespace
   ↓
3. If LUN group name and LUNs are selected (optional during initial setup):
   a. Create LocalDisk CRs (one per selected LUN)
      - Name: localdisk-{WWN}
      - spec.device = disk path, spec.node = node name
      - Label: { discovered: 'true' }
   b. Create Filesystem CR (local type)
      - Name: user-provided LUN group name
      - References LocalDisk CRs in pools
      - blockSize: '4M', replication: '1-way', type: 'shared'
   c. Create TWO StorageClasses:
      - Container SC: name = "san-{fsName}", filesetType: 'independent'
      - VM SC: name = "san-{fsName}-vm", volumeType: 'vmdisk'
      - Both use provisioner: spectrumscale.csi.ibm.com
      - Both: reclaimPolicy=Delete, allowVolumeExpansion=true, volumeBindingMode=Immediate
   ↓
4. Navigate to /odf/external-systems
```

**Key Points:**

- The local Scale cluster is **standalone** - no connection to remote Scale
- Scale software runs **locally** to manage the LUNs
- The "external" aspect is the **storage source** (SAN arrays), not the Scale software
- LUN group creation is **optional** during initial SAN setup - you can set up the cluster first and add LUN groups later via the "Add LUN group" modal
- **Two StorageClasses** are created per Filesystem - one for containers, one for VMs
- KMM (Kernel Module Management) configuration is included when no persistent image registry is detected

**Files**:

- `packages/odf/components/create-storage-system/external-systems/CreateSANSystem/CreateSANSystem.tsx`
- `packages/odf/components/create-storage-system/external-systems/CreateSANSystem/payload.ts`
- `packages/odf/components/create-storage-system/external-systems/CreateSANSystem/useDeviceFinder.ts`
- `packages/odf/components/create-storage-system/external-systems/CreateSANSystem/ExternalRegistryFormSection.tsx`
- `packages/odf/components/create-storage-system/external-systems/CreateSANSystem/usePersistentRegistryCheck.ts`
- `packages/odf/components/create-storage-system/external-systems/CreateSANSystem/types.ts`

---

### Scale (CNSA) Setup Workflow

```
1. User provides name, connection details, filesystem name, optional encryption
   ↓
2. If local Cluster CR doesn't exist:
   a. Label selected nodes with scale.spectrum.ibm.com/daemon-selector
   b. Calculate optimal resource requests from node specs
   c. Create Cluster CR ("ibm-spectrum-scale")
      - Same shared local cluster as SAN
      - Includes resource requests for daemon pods
      - NOTE: Does NOT include KMM config or cluster labels for Scale setup
   d. Configure metrics namespace labels
   NOTE: Scale does NOT create the CSI Driver (unlike SAN)
   ↓
3. If CA certificate was uploaded:
   a. Create CA cert Secret ("{name}") in ibm-spectrum-scale namespace
      - Contains base64-encoded CA certificate in data['ca.crt']
   b. Create ConfigMap ("{name}-ca-cert") for RemoteCluster reference
      - Contains CA certificate in data['ca.crt']
   ↓
4. Create user details Secret ("{name}-user-details-secret")
   - Contains username and password for remote Scale cluster
   ↓
5. Create RemoteCluster CR ("{name}")
   - Connection to external Scale cluster (outside Kubernetes)
   - Hosts: 1-3 management endpoints
   - References user details secret
   - References CA cert ConfigMap (if provided)
   - insecureSkipVerify: true if no CA cert, false if CA cert provided
   - passwordRotation: {} (empty object)
   ↓
6. Create Filesystem CR ("{name}-{fsName}")
   - References RemoteCluster (spec.remote.cluster = name)
   - Points to remote filesystem (spec.remote.fs = fsName)
   - Includes seLinuxOptions: { level: 's0', role: 'object_r', type: 'container_file_t', user: 'system_u' }
   ↓
7. If encryption enabled:
   a. Create encryption ConfigMap ("{name}-encryption-config")
      - Contains encryption CA certificate
   b. Create encryption Secret ("{name}-encryption-secret")
      - Contains encryption username/password
   c. Create EncryptionConfig CR ("{name}-encryption-config")
      - Server, tenant, client, secret, cacert (ConfigMap name)
   ↓
8. Navigate to /odf/external-systems/scale.spectrum.ibm.com~v1beta1~remotecluster/{name}
```

**Important Notes:**

1. **Cluster CR Creation**:
   - Scale creates the **local** Cluster CR only if it doesn't exist
   - This is the **same** Cluster CR that SAN uses (shared infrastructure)
   - If SAN was set up first, Scale will **reuse** the existing Cluster CR
   - The Cluster CR represents the **local** Scale infrastructure, not the remote one

2. **Why Scale Needs Local Cluster CR**:
   - Even though Scale connects to a **remote** Scale cluster, it still needs:
     - **Local Scale daemon pods** to communicate with the remote cluster
     - **Local CSI driver** (`spectrumscale.csi.ibm.com`) to provision volumes from remote filesystems
     - **Local infrastructure** to manage the connection and handle volume operations
   - Think of it as: Local Scale cluster acts as a "client" or "gateway" to the remote Scale cluster

3. **Differences from SAN Cluster CR creation**:
   - Scale does **NOT** create the CSI Driver (SAN does)
   - Scale does **NOT** include KMM/GPFS module management config
   - Scale does **NOT** set `addClusterLabels` flag
   - Both calculate and include optimal resource requests

4. **Two Different Clusters - Don't Confuse Them!**:
   - **Local Cluster CR** (`Cluster` kind):
     - Represents Scale infrastructure running **in your Kubernetes cluster**
     - **Namespaced** (in `ibm-spectrum-scale`), name: `"ibm-spectrum-scale"`
     - Manages local Scale daemon pods
     - **Shared** by both SAN and Scale systems
   - **RemoteCluster CR** (`RemoteCluster` kind):
     - Represents connection to an **external Scale cluster** (outside Kubernetes)
     - Namespaced, user-provided name
     - Contains connection details to remote Scale cluster
     - **Scale-specific** only

5. **Key Distinction**:

   ```
   Local Cluster CR (Cluster)     →  Infrastructure in YOUR cluster
   RemoteCluster CR               →  Connection to EXTERNAL cluster
   Filesystem (remote)            →  Uses RemoteCluster to access remote filesystem
   ```

6. **CA Certificate Handling**:
   - If CA certificate is provided:
     - A **Secret** is created with the base64-encoded cert
     - A **ConfigMap** is created for the RemoteCluster `cacert` reference
     - `insecureSkipVerify` is set to `false` on RemoteCluster
   - If no CA certificate:
     - `insecureSkipVerify` is set to `true` on RemoteCluster

**Files**:

- `packages/odf/components/create-storage-system/external-systems/CreateScaleSystem/CreateScaleSystem.tsx`
- `packages/odf/components/create-storage-system/external-systems/CreateScaleSystem/payload.ts`
- `packages/odf/components/create-storage-system/external-systems/CreateScaleSystem/types.ts`

---

## LUN Discovery and Selection

### How LUNs Are Discovered

1. **Device Finder Service**: Uses a backend proxy endpoint (`/api/proxy/plugin/.../cnsa/devicefinder`)
2. **Initialization**: POST request initiates the device finder
3. **Node Selection**: PUT request with node selector (hostnames) updates which nodes to scan
4. **Polling**: GET requests poll every 5 seconds for discovered devices
5. **Shared Filtering**: Only LUNs accessible from **ALL** selected nodes are shown (shared devices)
6. **Used Device Filtering**: LUNs that already have LocalDisk CRs are filtered out

**LUN Properties (from Device Finder)**:

- `path`: Device path (e.g., `/dev/sdb`)
- `WWN`: World Wide Name (unique identifier)
- `size`: Capacity in bytes (number)
- `type`: Device type
- `nodeName`: Node where LUN is accessible (added by frontend)

**Code Location**: `packages/odf/components/create-storage-system/external-systems/CreateSANSystem/useDeviceFinder.ts`

### LUN Group Creation

- **LUN Group** = A group of selected LUNs that form a filesystem
- Created via `AddLunGroupModal` or during SAN system creation
- Each LUN group becomes a Filesystem CR
- Each Filesystem gets **two** corresponding StorageClasses (containers + VMs)

**Code Location**: `packages/odf/modals/lun-group/AddLunGroupModal.tsx`

### LUN Group Deletion

- LUN groups can be deleted via `DeleteLUNModal` from the SAN dashboard kebab menu

**Code Location**: `packages/odf/modals/lun-group/DeleteLUNModal.tsx`

---

## StorageClass Creation

### SAN StorageClasses

Each SAN Filesystem CR gets **two** StorageClasses:

| StorageClass     | Name Pattern              | Purpose                   | Extra Parameters             |
| ---------------- | ------------------------- | ------------------------- | ---------------------------- |
| **Container SC** | `san-{fileSystemName}`    | For container workloads   | `filesetType: 'independent'` |
| **VM SC**        | `san-{fileSystemName}-vm` | For virtual machine disks | `volumeType: 'vmdisk'`       |

Both share:

- **Provisioner**: `spectrumscale.csi.ibm.com`
- **Parameters**: `volBackendFs: <filesystem-name>`
- **reclaimPolicy**: `Delete`
- **allowVolumeExpansion**: `true`
- **volumeBindingMode**: `Immediate`

### Scale StorageClasses

Scale Filesystem CRs do **not** create StorageClasses during setup. StorageClasses are managed separately for Scale.

**Code Location**: `packages/odf/components/create-storage-system/external-systems/CreateSANSystem/payload.ts`

---

## Dashboards

### SAN Dashboard

- **Path**: `/odf/external-systems` (SAN section)
- **Title**: "Scale Dashboard" with breadcrumb "IBM SAN"
- **Shows**:
  - Status of local Scale cluster (StatusCard)
  - Capacity metrics (CapacityCard - shared from ibm-common)
  - LUN groups table with status, StorageClasses, console links (LUNCard)
  - Activity (ActivityCard - shared from ibm-common)
- **Actions**: Add LUN group (via kebab menu)
- **LUN Group Table Columns**: Name, Status, StorageClasses, Console link, Kebab actions
- **LUN Group Statuses**: Connected, Creating, Unhealthy
- **Per-LUN Kebab Actions**: Delete LUN group
- **Console Links**: Links to Scale GUI filesystem view via OpenShift Route (`ibm-spectrum-scale-gui`)
- **Filtering**: Uses `filterSANFileSystems()` - filters FileSystems with `spec.local` and no `spec.remote`

**Files**:

- `packages/odf/components/san-dashboard/SANDashboard.tsx`
- `packages/odf/components/san-dashboard/LUNCard.tsx`
- `packages/odf/components/san-dashboard/StatusCard.tsx`
- `packages/odf/components/san-dashboard/useScaleGUILink.ts`

### Scale (CNSA) Dashboard

- **Path**: `/odf/external-systems/scale.spectrum.ibm.com~v1beta1~remotecluster/{systemName}`
- **Title**: "Scale Dashboard" with breadcrumb "IBM Scale"
- **Shows**:
  - Status of remote Scale cluster (StatusCard)
  - Capacity metrics (CapacityCard)
  - Remote filesystems table (FileSystemsCard)
  - Details (DetailsCard)
  - Activity (ActivityCard)
- **Actions**: Add remote FileSystem (via kebab menu)
- **FileSystem Table Columns**: Name, Connection status
- **FileSystem Statuses**: Connected (Success condition True), Disconnected
- **Filtering**: Uses `filterScaleFileSystems()` - **filtered by RemoteCluster name** (`spec.remote.cluster === externalSystemName` from URL params)

**Files**:

- `packages/odf/components/scale-dashboard/ScaleDashboard.tsx`
- `packages/odf/components/scale-dashboard/FileSystems.tsx`
- `packages/odf/components/scale-dashboard/StatusCard.tsx`
- `packages/odf/components/scale-dashboard/CapacityCard.tsx`
- `packages/odf/components/scale-dashboard/DetailsCard.tsx`
- `packages/odf/components/scale-dashboard/ActivityCard.tsx`

### Shared IBM Common Components

- `packages/odf/components/ibm-common/ActivityCard.tsx` - Shared activity card
- `packages/odf/components/ibm-common/CapacityCard.tsx` - Shared capacity card (filters SCs by `SCALE_PROVISIONER`)
- `packages/odf/components/ibm-common/utils.ts` - Filter functions:
  - `filterScaleFileSystems(fileSystems, remoteClusterName)` - Filters by `spec.remote.cluster`
  - `filterSANFileSystems(fileSystems)` - Filters by `spec.local` present and `spec.remote` empty
  - `filterCnsaFileSystems(fileSystems)` - Filters any filesystem with `spec.remote`
- `packages/odf/components/ibm-common/lun-group-health.ts` - LUN group health status utilities
- `packages/odf/components/ibm-common/cnsa-filesystem-health.ts` - CNSA filesystem health utilities

### External Systems Overview Card

- `packages/odf/components/overview/external-systems-card/ExternalSystemsCard.tsx` - Overview card on ODF dashboard showing external system summary with status counts

---

## Relationship Between Scale and SAN Systems

### Shared Infrastructure: Local Cluster CR

**Key Insight**: Both Scale and SAN systems **share the same local Cluster CR**.

### Visual: Shared Cluster CR Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│          Kubernetes Cluster (Single Cluster CR - Namespaced)     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Namespace: ibm-spectrum-scale                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Cluster CR (Namespaced)                                  │  │
│  │  Name: "ibm-spectrum-scale"                               │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │  Scale Daemon Pods                                  │  │  │
│  │  │  - Run on labeled nodes                             │  │  │
│  │  │  - Manage Scale infrastructure                     │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │  CSI Driver: spectrumscale.csi.ibm.com             │  │  │
│  │  │  - Enables volume provisioning                      │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                           ▲                                     │
│                           │                                     │
│              ┌────────────┴────────────┐                       │
│              │                         │                       │
│    ┌─────────▼─────────┐    ┌─────────▼─────────┐            │
│    │  SAN System       │    │  Scale System     │            │
│    │                    │    │                   │            │
│    │  Uses Cluster CR   │    │  Uses Cluster CR  │            │
│    │  (Shared)         │    │  (Shared)        │            │
│    │                    │    │                   │            │
│    │  Creates:          │    │  Creates:         │            │
│    │  - CSI Driver      │    │  - RemoteCluster  │            │
│    │  - LocalDisk CRs   │    │    CR              │            │
│    │  - Filesystem       │    │  - Filesystem      │            │
│    │    (local)         │    │    (remote)        │            │
│    │  - 2 StorageClasses │    │  - Secret          │            │
│    │    per Filesystem   │    │  - ConfigMap       │            │
│    │                     │    │  - EncryptionConfig│            │
│    └────────────────────┘    └───────────────────┘            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

Key Points:
- Only ONE Cluster CR exists (namespaced in ibm-spectrum-scale)
- Created by FIRST system (SAN or Scale)
- REUSED by SECOND system
- Both systems share the same Scale infrastructure
```

#### The Shared Cluster CR

- **Name**: `IBM_SCALE_LOCAL_CLUSTER_NAME` = `"ibm-spectrum-scale"`
- **Scope**: **Namespaced** (in `ibm-spectrum-scale` namespace)
- **Purpose**: Represents the local IBM Spectrum Scale cluster infrastructure
- **Created By**:
  - **First system** that needs it (either SAN or Scale)
  - If SAN is set up first → SAN creates it (with KMM config, cluster labels)
  - If Scale is set up first → Scale creates it (without KMM config)
- **Reused By**: The second system (if both are used)

#### Why They Share It

Both systems need the same local Scale infrastructure:

1. **Scale Daemon Pods**: Both need Scale daemons running on nodes
2. **CSI Driver**: Both use `spectrumscale.csi.ibm.com` for volume provisioning
3. **Node Labels**: Both label nodes with `scale.spectrum.ibm.com/daemon-selector`
4. **Scale License**: Both need Scale license acceptance
5. **Metrics Configuration**: Both configure namespace labels for Prometheus monitoring

#### The Check: `useIsLocalClusterConfigured`

Both forms use the same hook to check if the local cluster exists:

```typescript
const localCluster = useIsLocalClusterConfigured();
const isLocalClusterConfigured = !_.isEmpty(localCluster);
```

**What This Check Does:**

- Watches for Cluster CR with name `"ibm-spectrum-scale"` using `useK8sWatchResource`
- Uses a `useRef` to cache the result (avoids re-fetches)
- Returns the Cluster CR if found and loaded, `null` otherwise

**How It Affects Forms:**

1. **If Cluster CR exists** (`isLocalClusterConfigured = true`):
   - Node selection is **disabled** (cluster already configured with nodes)
   - Skips creating Cluster CR (already exists)
   - SAN: Skips creating CSI Driver and KMM config
   - Skips labeling nodes (already labeled)
   - Skips configuring metrics namespace labels
   - Shows alert: "Nodes are disabled because the local cluster is configured"

2. **If Cluster CR doesn't exist** (`isLocalClusterConfigured = false`):
   - Node selection is **enabled** (need to select nodes for cluster)
   - Creates Cluster CR (first time setup)
   - SAN: Creates CSI Driver and includes KMM config if needed
   - Labels selected nodes
   - Configures metrics namespace labels

#### Example Scenarios

**Scenario 1: SAN Set Up First**

```
1. User sets up SAN → Creates Cluster CR ("ibm-spectrum-scale")
   - Also creates CSI Driver
   - Also configures metrics namespace labels
2. User sets up Scale → Finds Cluster CR exists
   → Disables node selection
   → Reuses existing cluster
   → Only creates Secret + ConfigMap + RemoteCluster + Filesystem (remote)
```

**Scenario 2: Scale Set Up First**

```
1. User sets up Scale → Creates Cluster CR ("ibm-spectrum-scale")
   - Configures metrics namespace labels
   - Does NOT create CSI Driver
2. User sets up SAN → Finds Cluster CR exists
   → Disables node selection
   → Reuses existing cluster
   → Only creates LocalDisk + Filesystem (local) + 2 StorageClasses
```

**Scenario 3: Only One System**

```
- If only SAN is used → Creates and uses Cluster CR + CSI Driver
- If only Scale is used → Creates and uses Cluster CR (no CSI Driver)
- Both can coexist and share the same Cluster CR
```

#### Code Locations

- **Hook**: `packages/odf/components/create-storage-system/external-systems/common/hooks.ts`
- **Shared Payload**: `packages/odf/components/create-storage-system/external-systems/common/payload.ts`
- **Resource Calculations**: `packages/odf/components/create-storage-system/external-systems/common/utils.ts`
- **Node Section UI**: `packages/odf/components/create-storage-system/external-systems/common/NodesSection.tsx`
- **Name Validation**: `packages/odf/components/create-storage-system/external-systems/common/useResourceNameValidation.ts`
- **SAN Usage**: `packages/odf/components/create-storage-system/external-systems/CreateSANSystem/CreateSANSystem.tsx`
- **Scale Usage**: `packages/odf/components/create-storage-system/external-systems/CreateScaleSystem/CreateScaleSystem.tsx`

---

## Additional Features

### KMM (Kernel Module Management) Configuration

- **When**: During SAN setup, if no persistent image registry is detected
- **Check**: `usePersistentRegistryCheck` hook checks for OpenShift Image Registry with non-emptyDir storage
- **Configures**: `spec.gpfsModuleManagement.kmm` on the Cluster CR
  - `imageRepository`: External registry URL, repo name, secret key
  - `moduleSigning`: Secure boot key/cert secrets (optional)
- **Form**: `ExternalRegistryFormSection` component

### Metrics Namespace Configuration

- **When**: During both SAN and Scale first-time setup
- **Does**:
  1. Labels `openshift-user-workload-monitoring` namespace with `scale.spectrum.ibm.com/networkpolicy=allow`
  2. Removes `openshift.io/cluster-monitoring` label from `ibm-spectrum-scale` namespace

### Resource Request Optimization

- **When**: During both SAN and Scale Cluster CR creation
- **Calculates** optimal daemon pod resource requests based on selected node specs:
  - CPU: `max(ceil(minNodeCPU * 5%), 2 cores)`
  - Memory: `max(ceil(minNodeMemory * 5%), 6Gi)`
- **Code**: `packages/odf/components/create-storage-system/external-systems/common/utils.ts`

### Scale GUI Console Link

- **Where**: SAN dashboard LUN Card
- **Source**: Reads OpenShift Route `ibm-spectrum-scale-gui` in `ibm-spectrum-scale` namespace
- **URL Pattern**: `https://{route-host}/gui#files-filesystems-/{fsName}`
- **Code**: `packages/odf/components/san-dashboard/useScaleGUILink.ts`

---

## Summary Table: CR Usage

| CR                   | Created By                  | Used For                     | Namespace Scope | Shared?                  |
| -------------------- | --------------------------- | ---------------------------- | --------------- | ------------------------ |
| **Cluster**          | First system (SAN or Scale) | Local Scale cluster          | Namespaced      | **YES** - Shared by both |
| **RemoteCluster**    | Scale setup                 | External Scale connection    | Namespaced      | No - Scale only          |
| **Filesystem**       | Both                        | Filesystem (local or remote) | Namespaced      | No - Each creates own    |
| **LocalDisk**        | SAN setup                   | LUN representation           | Namespaced      | No - SAN only            |
| **EncryptionConfig** | Scale setup (optional)      | Encryption configuration     | Namespaced      | No - Scale only          |
| **Daemon**           | Scale operator              | Scale daemon config          | Namespaced      | No - Managed by operator |

---

## Key Files Reference

### Models

- `packages/shared/src/models/scale.ts` - All CR model definitions

### Types

- `packages/odf/types/scale.ts` - TypeScript type definitions for all Scale CRs, including:
  - `ClusterKind`, `ClusterSpec`, `ClusterStatus`
  - `FileSystemKind` (with `spec.local`, `spec.remote`, `spec.vdiskNSD`, `spec.seLinuxOptions`)
  - `RemoteClusterKind` (with `spec.gui`, `spec.contactNodes`)
  - `EncryptionConfigKind`
  - `LocalDiskKind` (with `spec` and `status` fields)
  - `DaemonKind` (with full CRD spec)
  - `DaemonUserSpec`, `GuiSpec`, `PmcollectorSpec`, `GrafanaBridgeSpec`
  - `GetDevicefinderResponse`, `DiscoveredDevice`

### SAN

- `packages/odf/components/create-storage-system/external-systems/CreateSANSystem/` - SAN creation
  - `CreateSANSystem.tsx` - Main form component
  - `payload.ts` - CR creation functions (LocalDisk, Filesystem, StorageClass, CSIDriver)
  - `useDeviceFinder.ts` - LUN discovery via device finder service
  - `LUNsTable.tsx` - LUN selection table
  - `ExternalRegistryFormSection.tsx` - KMM registry form
  - `usePersistentRegistryCheck.ts` - Image registry check
  - `useFormValidation.ts` - Form validation rules
  - `types.ts` - SAN-specific types
- `packages/odf/components/san-dashboard/` - SAN dashboard
  - `SANDashboard.tsx`, `LUNCard.tsx`, `StatusCard.tsx`, `useScaleGUILink.ts`
- `packages/odf/modals/lun-group/` - LUN group management
  - `AddLunGroupModal.tsx` - Create new LUN group
  - `DeleteLUNModal.tsx` - Delete LUN group

### Scale

- `packages/odf/components/create-storage-system/external-systems/CreateScaleSystem/` - Scale creation
  - `CreateScaleSystem.tsx` - Main form component
  - `payload.ts` - CR creation functions (RemoteCluster, Filesystem, EncryptionConfig, Secrets, ConfigMaps)
  - `useFormValidation.ts` - Form validation rules
  - `types.ts` - Scale-specific types
- `packages/odf/components/scale-dashboard/` - Scale dashboard
  - `ScaleDashboard.tsx`, `FileSystems.tsx`, `StatusCard.tsx`, `CapacityCard.tsx`, `DetailsCard.tsx`, `ActivityCard.tsx`
- `packages/odf/modals/add-remote-fs/` - Remote filesystem management
  - `AddRemoteFileSystemModal.tsx` - Add remote filesystem to existing RemoteCluster

### Common / Shared

- `packages/odf/components/create-storage-system/external-systems/common/` - Shared utilities
  - `hooks.ts` - `useIsLocalClusterConfigured` hook
  - `payload.ts` - Shared CR creation (`createScaleLocalClusterPayload`, `labelNodes`, `configureMetricsNamespaceLabels`)
  - `utils.ts` - `getOptimalResourceRequests` calculation
  - `NodesSection.tsx` - Shared node selection component
  - `useResourceNameValidation.ts` - Shared name validation
- `packages/odf/components/ibm-common/` - Shared dashboard components
  - `utils.ts` - Filter functions (`filterScaleFileSystems`, `filterSANFileSystems`, `filterCnsaFileSystems`)
  - `ActivityCard.tsx`, `CapacityCard.tsx` - Shared dashboard cards
  - `lun-group-health.ts`, `cnsa-filesystem-health.ts` - Health status utilities
- `packages/odf/components/overview/external-systems-card/` - ODF overview card

---

## Constants

### In `packages/odf/constants/scale.ts`:

- `IBM_SCALE_NAMESPACE`: `"ibm-spectrum-scale"` - Default namespace for all Scale CRs
- `IBM_SCALE_OPERATOR_NAME`: `"ibm-spectrum-scale-operator"` - Operator name
- `IBM_SCALE_LOCAL_CLUSTER_NAME`: `"ibm-spectrum-scale"` - Local cluster CR name
- `SAN_STORAGE_SYSTEM_NAME`: `"SAN_Storage"` - SAN system identifier

### In `packages/odf/constants/common.ts`:

- `SCALE_PROVISIONER`: `"spectrumscale.csi.ibm.com"` - CSI provisioner name
