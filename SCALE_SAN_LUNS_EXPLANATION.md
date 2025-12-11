# Scale, SAN, and LUNs - Comprehensive Explanation

## Overview

ODF (OpenShift Data Foundation) supports **External StorageSystems**, which allow you to connect to external storage solutions. Two key external storage types are:

1. **IBM Spectrum Scale (Scale)** - External remote Scale cluster
2. **SAN (Storage Area Network)** - Local SAN storage using LUNs

Both use IBM Spectrum Scale technology but in different ways.

---

## Key Concepts

### What is Scale?

**IBM Spectrum Scale** (also called "Scale") is IBM's parallel file system software. In ODF, "Scale" refers to connecting to an **external/remote** IBM Spectrum Scale cluster that already exists outside your Kubernetes cluster.

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
- Discovered from SAN storage arrays
- Grouped together to create filesystems
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
        │  Scale (IBM)  │         │  SAN (Local)    │
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

| Aspect               | Scale                                                | SAN                                                             |
| -------------------- | ---------------------------------------------------- | --------------------------------------------------------------- |
| **Location**         | External/Remote cluster                              | Local (within Kubernetes cluster)                               |
| **Setup**            | Connect to existing Scale cluster                    | Create new local Scale cluster                                  |
| **Storage**          | Uses remote filesystems                              | Uses local LUNs (block devices)                                 |
| **Storage Source**   | External Scale cluster                               | External SAN storage arrays                                     |
| **Scale Connection** | Connects to remote Scale                             | **No remote connection** - standalone local cluster             |
| **Use Case**         | Connect to existing Scale infrastructure             | Use SAN storage arrays with LUNs                                |
| **CRs Created**      | RemoteCluster, FileSystem (remote), EncryptionConfig | Cluster (local), LocalDisk, FileSystem (local)                  |
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
│                    SCALE (External System)                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Kubernetes Cluster                                            │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  RemoteCluster CR                                        │ │
│  │  FileSystem CR (remote)                                  │ │
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
│  │  Cluster CR (local)                                       │ │
│  │  ┌────────────────────────────────────────────────────┐   │ │
│  │  │  Scale Daemon Pods (local)                        │   │ │
│  │  │  - Manage filesystem                               │   │ │
│  │  │  - Handle replication                              │   │ │
│  │  │  - Provide CSI driver                              │   │ │
│  │  └────────────────────────────────────────────────────┘   │ │
│  │                                                              │ │
│  │  LocalDisk CRs ──> FileSystem CR (local)                    │ │
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

### 1. **Cluster** (`ClusterModel`)

- **Purpose**: Represents a **local** IBM Spectrum Scale cluster within your Kubernetes cluster
- **When Created**:
  - When setting up **SAN** storage (first time)
  - Used to manage local Scale daemons and configuration
  - **Only one local cluster is created** - reused for all SAN LUN groups
- **Used By**:
  - SAN setup (`CreateSANSystem`)
  - Both Scale and SAN dashboards reference it
- **Key Fields**:
  - `spec.daemon`: Configuration for Scale daemon pods
  - `spec.license`: License acceptance (data-access or data-management)
  - `spec.daemon.clusterProfile`: Performance tuning parameters
- **Namespace**: Cluster-scoped (not namespaced)
- **Example**: Created with name `IBM_SCALE_LOCAL_CLUSTER_NAME` in SAN setup
- **Note**: This is a **local** cluster - it does NOT connect to any remote Scale cluster

**Code Location**: `packages/odf/components/create-storage-system/external-systems/common/payload.ts`

---

### 2. **RemoteCluster** (`RemoteClusterModel`)

- **Purpose**: Represents a connection to an **external/remote** IBM Spectrum Scale cluster
- **When Created**:
  - When setting up **Scale** external system (connecting to remote Scale)
  - Contains connection details (hosts, credentials, certificates)
- **Used By**:
  - Scale external system setup (`CreateScaleSystem`)
  - Used to reference remote filesystems
- **Key Fields**:
  - `spec.gui.hosts`: Array of hostnames/IPs of remote Scale cluster
  - `spec.gui.secretName`: Secret containing username/password
  - `spec.gui.cacert`: CA certificate ConfigMap name
  - `spec.gui.port`: Port number (default 443)
- **Namespace**: Namespaced (typically `ibm-spectrum-scale`)
- **Example**: Created when connecting to an external Scale cluster

**Code Location**: `packages/odf/components/create-storage-system/external-systems/CreateScaleSystem/payload.ts`

---

### 3. **FileSystem** (`FileSystemModel`)

- **Purpose**: Represents a filesystem that can be either:
  - **Local**: Created from LUNs (SAN setup)
  - **Remote**: Referenced from external Scale cluster (Scale setup)
- **When Created**:
  - **SAN**: When creating a LUN group (local filesystem from LUNs)
  - **Scale**: When connecting to a remote filesystem
- **Used By**:
  - Both SAN and Scale systems
  - Used to create StorageClasses
- **Key Fields**:
  - `spec.local`: For SAN (local filesystem from LUNs)
    - `pools`: Disk pools with block size and disk references
    - `replication`: Replication factor (1-way, 2-way, 3-way)
    - `type`: 'shared' or 'unshared'
  - `spec.remote`: For Scale (remote filesystem reference)
    - `cluster`: Name of RemoteCluster
    - `fs`: Name of filesystem on remote cluster
- **Namespace**: Namespaced (typically `ibm-spectrum-scale`)

**Code Locations**:

- SAN: `packages/odf/components/create-storage-system/external-systems/CreateSANSystem/payload.ts`
- Scale: `packages/odf/components/create-storage-system/external-systems/CreateScaleSystem/payload.ts`

---

### 4. **LocalDisk** (`LocalDiskModel`)

- **Purpose**: Represents a discovered LUN/block device that will be used to create a local filesystem
- **When Created**:
  - **SAN setup only**: When user selects LUNs to create a LUN group
  - Created for each selected LUN
- **Used By**:
  - SAN system (`CreateSANSystem`)
  - Referenced by FileSystem CR in `spec.local.pools[].disks[]`
- **Key Fields**:
  - `spec.device`: Device path (e.g., `/dev/sdb`)
  - `spec.wwn`: World Wide Name (unique identifier for the LUN)
  - `spec.capacity`: Disk capacity
  - `spec.node`: Node name where the disk is accessible
- **Namespace**: Namespaced (typically `ibm-spectrum-scale`)
- **Example**: Created with name pattern `localdisk-{WWN}`

**Code Location**: `packages/odf/components/create-storage-system/external-systems/CreateSANSystem/payload.ts`

---

### 5. **EncryptionConfig** (`EncryptionConfigModel`)

- **Purpose**: Configuration for encryption at rest using external key management servers
- **When Created**:
  - **Scale setup only**: When encryption is enabled during Scale external system setup
  - Optional feature
- **Used By**:
  - Scale external system with encryption enabled
- **Key Fields**:
  - `spec.server`: Key management server address
  - `spec.tenant`: Tenant ID
  - `spec.client`: Client ID
  - `spec.secret`: Secret name containing credentials
  - `spec.cacert`: CA certificate ConfigMap name
  - `spec.filesystems`: List of filesystems to encrypt
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
  - `spec.edition`: Scale edition (data-access, data-management, erasure-code)
  - `spec.site`: Site name and DNS zone
  - `spec.roles`: Role definitions (afm, storage, client)
  - `spec.clusterProfile`: Advanced performance tuning
- **Note**: This CR is defined in the models but not actively created by the ODF console UI. It's managed by the Scale operator.

---

## Workflow: How CRs Are Created

### SAN Setup Workflow

```
1. User selects nodes and LUNs
   ↓
2. Create Cluster CR (if not exists)
   - Local Scale cluster configuration
   - Creates Scale daemon pods on selected nodes
   - Sets up local Scale cluster (standalone, no remote connection)
   ↓
3. Create CSI Driver (if not exists)
   - spectrumscale.csi.ibm.com
   - Enables Kubernetes volume provisioning
   ↓
4. Create LocalDisk CRs (one per selected LUN)
   - Each LUN becomes a LocalDisk
   - Represents raw block devices from SAN arrays
   ↓
5. Create FileSystem CR (local type)
   - References LocalDisk CRs in pools
   - Scale creates distributed filesystem from LUNs
   - Provides replication, HA, multi-node access
   ↓
6. Create StorageClass
   - Uses FileSystem name
   - Provisioner: spectrumscale.csi.ibm.com
   - Enables dynamic volume provisioning
```

**Key Points:**

- The local Scale cluster is **standalone** - no connection to remote Scale
- Scale software runs **locally** to manage the LUNs
- The "external" aspect is the **storage source** (SAN arrays), not the Scale software

**Files**:

- `packages/odf/components/create-storage-system/external-systems/CreateSANSystem/CreateSANSystem.tsx`
- `packages/odf/components/create-storage-system/external-systems/CreateSANSystem/payload.ts`

---

### Scale Setup Workflow

```
1. User provides remote cluster connection details
   ↓
2. Check if local Cluster CR exists
   - Uses useIsLocalClusterConfigured() hook
   - Checks for Cluster CR named "local-cluster"
   ↓
3. If Cluster CR doesn't exist (first time):
   - Label selected nodes with scale.spectrum.ibm.com/daemon-selector
   - Create Cluster CR (local-cluster)
     * This is the SHARED local Scale cluster infrastructure
     * Will be reused by SAN if set up later
     * Represents Scale daemons running in your Kubernetes cluster
   - Note: If Cluster CR already exists (e.g., SAN was set up first),
     skip this step and reuse existing cluster
   ↓
4. Create Secret (username/password for remote Scale)
   - Contains credentials to connect to external Scale cluster
   ↓
5. Create ConfigMap (CA certificate, if provided)
   - Contains CA certificate for secure connection to remote Scale
   ↓
6. Create RemoteCluster CR
   - Connection to external Scale cluster (outside Kubernetes)
   - Contains connection details (hosts, credentials, certificates)
   - This is DIFFERENT from the local Cluster CR
   ↓
7. Create FileSystem CR (remote type)
   - References RemoteCluster (not local Cluster)
   - Points to remote filesystem on external Scale cluster
   - spec.remote.cluster = RemoteCluster name
   - spec.remote.fs = filesystem name on remote cluster
   ↓
8. (Optional) Create EncryptionConfig CR
   - If encryption is enabled
   - Configures encryption for the remote filesystem
   - Uses external key management server
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

3. **Two Different Clusters - Don't Confuse Them!**:
   - **Local Cluster CR** (`Cluster` kind):
     - Represents Scale infrastructure running **in your Kubernetes cluster**
     - Cluster-scoped, name: `"local-cluster"`
     - Manages local Scale daemon pods
     - **Shared** by both SAN and Scale systems
   - **RemoteCluster CR** (`RemoteCluster` kind):
     - Represents connection to an **external Scale cluster** (outside Kubernetes)
     - Namespaced, user-provided name
     - Contains connection details to remote Scale cluster
     - **Scale-specific** only

4. **Key Distinction**:
   ```
   Local Cluster CR (Cluster)     →  Infrastructure in YOUR cluster
   RemoteCluster CR               →  Connection to EXTERNAL cluster
   FileSystem (remote)            →  Uses RemoteCluster to access remote filesystem
   ```

**Files**:

- `packages/odf/components/create-storage-system/external-systems/CreateScaleSystem/CreateScaleSystem.tsx`
- `packages/odf/components/create-storage-system/external-systems/CreateScaleSystem/payload.ts`

---

## LUN Discovery and Selection

### How LUNs Are Discovered

1. **Device Finder**: Uses a device finder service/API to discover LUNs
2. **Node Selection**: User selects nodes that should have access to shared LUNs
3. **Shared Devices**: Only LUNs accessible from ALL selected nodes are shown
4. **LUN Properties**:
   - `path`: Device path (e.g., `/dev/sdb`)
   - `WWN`: World Wide Name (unique identifier)
   - `size`: Capacity in bytes
   - `nodeName`: Node where LUN is accessible
   - `type`: Device type

**Code Location**: `packages/odf/components/create-storage-system/external-systems/CreateSANSystem/useDeviceFinder.ts`

### LUN Group Creation

- **LUN Group** = A group of selected LUNs that form a filesystem
- Created via `AddLunGroupModal` or during SAN system creation
- Each LUN group becomes a FileSystem CR
- Each FileSystem gets a corresponding StorageClass

**Code Location**: `packages/odf/modals/lun-group/AddLunGroupModal.tsx`

---

## StorageClass Creation

Both Scale and SAN create StorageClasses:

- **SAN**: StorageClass name = FileSystem name (LUN group name)
- **Scale**: StorageClass name = FileSystem name
- **Provisioner**: `spectrumscale.csi.ibm.com`
- **Parameters**: `volBackendFs: <filesystem-name>`

**Code Location**:

- SAN: `packages/odf/components/create-storage-system/external-systems/CreateSANSystem/payload.ts`
- Scale: Similar pattern (StorageClass created based on FileSystem)

---

## Dashboards

### SAN Dashboard

- **Path**: `/odf/external-systems/san`
- **Shows**:
  - Status of local Scale cluster
  - Capacity metrics
  - LUN groups (FileSystems)
  - Activity
- **Actions**: Add LUN group

**File**: `packages/odf/components/san-dashboard/SANDashboard.tsx`

### Scale Dashboard

- **Path**: `/odf/external-systems/scale.spectrum.ibm.com~v1beta1~remotecluster/{name}`
- **Shows**:
  - Status of remote Scale cluster
  - Capacity metrics
  - Remote filesystems
  - Details and activity
- **Actions**: Add remote FileSystem

**File**: `packages/odf/components/scale-dashboard/ScaleDashboard.tsx`

---

## Relationship Between Scale and SAN Systems

### Shared Infrastructure: Local Cluster CR

**Key Insight**: Both Scale and SAN systems **share the same local Cluster CR**.

### Visual: Shared Cluster CR Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│              Kubernetes Cluster (Single Cluster CR)              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Cluster CR (Cluster-scoped)                             │  │
│  │  Name: "local-cluster"                                   │  │
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
│              │                         │                       │
│    ┌─────────▼─────────┐    ┌─────────▼─────────┐            │
│    │  SAN System       │    │  Scale System     │            │
│    │                    │    │                   │            │
│    │  Uses Cluster CR   │    │  Uses Cluster CR  │            │
│    │  Shared         │    │  Shared        │            │
│    │                    │    │                   │            │
│    │  Creates:          │    │  Creates:         │            │
│    │  - LocalDisk CRs   │    │  - RemoteCluster  │            │
│    │  - FileSystem       │    │    CR              │            │
│    │    (local)         │    │  - FileSystem      │            │
│    │                     │    │    (remote)        │            │
│    └────────────────────┘    └───────────────────┘            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

Key Points:
- Only ONE Cluster CR exists (cluster-scoped)
- Created by FIRST system (SAN or Scale)
- REUSED by SECOND system
- Both systems share the same Scale infrastructure
```

#### The Shared Cluster CR

- **Name**: `IBM_SCALE_LOCAL_CLUSTER_NAME` (typically `"local-cluster"`)
- **Scope**: Cluster-scoped (only one exists in the entire cluster)
- **Purpose**: Represents the local IBM Spectrum Scale cluster infrastructure
- **Created By**:
  - **First system** that needs it (either SAN or Scale)
  - If SAN is set up first → SAN creates it
  - If Scale is set up first → Scale creates it
- **Reused By**: The second system (if both are used)

#### Why They Share It

Both systems need the same local Scale infrastructure:

1. **Scale Daemon Pods**: Both need Scale daemons running on nodes
2. **CSI Driver**: Both use `spectrumscale.csi.ibm.com` for volume provisioning
3. **Node Labels**: Both label nodes with `scale.spectrum.ibm.com/daemon-selector`
4. **Scale License**: Both need Scale license acceptance

#### The Check: `useIsLocalClusterConfigured`

Both forms use the same hook to check if the local cluster exists:

```typescript
const localCluster = useIsLocalClusterConfigured();
const isLocalClusterConfigured = !_.isEmpty(localCluster);
```

**What This Check Does:**

- Checks if Cluster CR with name `"local-cluster"` exists
- Returns the Cluster CR if found, `null` otherwise

**How It Affects Forms:**

1. **If Cluster CR exists** (`isLocalClusterConfigured = true`):
   - Node selection is **disabled** (cluster already configured with nodes)
   - Skips creating Cluster CR (already exists)
   - Skips creating CSI Driver (already exists)
   - Skips labeling nodes (already labeled)
   - Shows alert: "Nodes are disabled because the local cluster is configured"

2. **If Cluster CR doesn't exist** (`isLocalClusterConfigured = false`):
   - Node selection is **enabled** (need to select nodes for cluster)
   - Creates Cluster CR (first time setup)
   - Creates CSI Driver (first time setup)
   - Labels selected nodes

#### Example Scenarios

**Scenario 1: SAN Set Up First**

```
1. User sets up SAN → Creates Cluster CR ("local-cluster")
2. User sets up Scale → Finds Cluster CR exists
   → Disables node selection
   → Reuses existing cluster
   → Only creates RemoteCluster + FileSystem (remote)
```

**Scenario 2: Scale Set Up First**

```
1. User sets up Scale → Creates Cluster CR ("local-cluster")
2. User sets up SAN → Finds Cluster CR exists
   → Disables node selection
   → Reuses existing cluster
   → Only creates LocalDisk + FileSystem (local)
```

**Scenario 3: Only One System**

```
- If only SAN is used → Creates and uses Cluster CR
- If only Scale is used → Creates and uses Cluster CR
- Both can coexist and share the same Cluster CR
```

#### Workflow: How the Check Works

**When Creating SAN System:**

```typescript
// 1. Check if local cluster exists
const localCluster = useIsLocalClusterConfigured();
const isLocalClusterConfigured = !_.isEmpty(localCluster);

// 2. In onCreate handler
if (!isLocalClusterConfigured) {
  // First time: Create cluster infrastructure
  await labelNodes(selectedNodes)();        // Label nodes
  await createScaleLocalClusterPayload()(); // Create Cluster CR
  await createCSIDriver();                   // Create CSI Driver
}
// Always: Create SAN-specific resources
await createLocalDisks(mappedLuns);
await createLocalFileSystem(lunGroupName, localDisks);
await createStorageClass(fileSystem);

// 3. In form UI
<NodesSection
  isDisabled={isLocalClusterConfigured}  // Disable if cluster exists
  selectedNodes={selectedNodes}
  setSelectedNodes={setSelectedNodes}
/>
```

**When Creating Scale System:**

```typescript
// Same check
const localCluster = useIsLocalClusterConfigured();
const isLocalClusterConfigured = !_.isEmpty(localCluster);

// In onCreate handler
if (!isLocalClusterConfigured) {
  // First time: Create cluster infrastructure
  await labelNodes(selectedNodes)();
  await createScaleLocalClusterPayload(encryptionEnabled)();
}
// Always: Create Scale-specific resources
await createRemoteCluster(...);
await createFileSystem(remoteClusterName, remoteFileSystemName);
// Optional: Create EncryptionConfig if enabled
```

**Key Behavior:**

- **If cluster exists**: Skip infrastructure setup, only create system-specific CRs
- **If cluster doesn't exist**: Create infrastructure first, then system-specific CRs
- **Node selection**: Disabled when cluster exists (prevents changing configured nodes)

#### Code Locations

- **Hook**: `packages/odf/components/create-storage-system/external-systems/common/hooks.ts`
- **SAN Usage**: `packages/odf/components/create-storage-system/external-systems/CreateSANSystem/CreateSANSystem.tsx` (line 58-59, 89-92, 143)
- **Scale Usage**: `packages/odf/components/create-storage-system/external-systems/CreateScaleSystem/CreateScaleSystem.tsx` (line 61-62, 155-160, 281)
- **Node Section**: `packages/odf/components/create-storage-system/external-systems/common/NodesSection.tsx` (line 96, 121, 147-155)

---

## Summary Table: CR Usage

| CR                   | Created By                  | Used For                     | Namespace Scope | Shared?                  |
| -------------------- | --------------------------- | ---------------------------- | --------------- | ------------------------ |
| **Cluster**          | First system (SAN or Scale) | Local Scale cluster          | Cluster-scoped  | **YES** - Shared by both |
| **RemoteCluster**    | Scale setup                 | External Scale connection    | Namespaced      | No - Scale only          |
| **FileSystem**       | Both                        | Filesystem (local or remote) | Namespaced      | No - Each creates own    |
| **LocalDisk**        | SAN setup                   | LUN representation           | Namespaced      | No - SAN only            |
| **EncryptionConfig** | Scale setup (optional)      | Encryption configuration     | Namespaced      | No - Scale only          |
| **Daemon**           | Scale operator              | Scale daemon config          | Namespaced      | No - Managed by operator |

---

## Key Files Reference

### Models

- `packages/shared/src/models/scale.ts` - All CR model definitions

### SAN

- `packages/odf/components/create-storage-system/external-systems/CreateSANSystem/` - SAN creation
- `packages/odf/components/san-dashboard/` - SAN dashboard
- `packages/odf/modals/lun-group/` - LUN group management

### Scale

- `packages/odf/components/create-storage-system/external-systems/CreateScaleSystem/` - Scale creation
- `packages/odf/components/scale-dashboard/` - Scale dashboard

### Common

- `packages/odf/components/create-storage-system/external-systems/common/` - Shared utilities
- `packages/odf/types/scale.ts` - TypeScript type definitions
- `packages/shared/src/hooks/useWatchStorageClusters.ts` - Watching Scale/SAN clusters

---

## Constants

- `IBM_SCALE_NAMESPACE`: `"ibm-spectrum-scale"` - Default namespace
- `IBM_SCALE_LOCAL_CLUSTER_NAME`: `"local-cluster"` - Local cluster name
- `SAN_STORAGE_SYSTEM_NAME`: `"SAN_Storage"` - SAN system identifier
- `SCALE_PROVISIONER`: `"spectrumscale.csi.ibm.com"` - CSI provisioner

**File**: `packages/odf/constants/scale.ts`
