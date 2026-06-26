# Filesystem CRs in Scale vs SAN

## Answer: Both Can Have Multiple Filesystem CRs

**Scale (CNSA)**: Can have **multiple** Filesystem CRs (one per remote filesystem)
**SAN**: Can have **multiple** Filesystem CRs (one per LUN group)

---

## Scale Filesystem CRs

### Initial Setup

- **One Filesystem CR** is created during Scale system setup
- References a remote filesystem on the external Scale cluster
- Name pattern: `${remoteClusterName}-${remoteFileSystemName}`
- Includes `seLinuxOptions` for container security

### Adding More Filesystems

- **"Add remote FileSystem"** modal allows adding more Filesystem CRs
- Each Filesystem CR references a different remote filesystem on the same RemoteCluster
- All Filesystem CRs reference the same RemoteCluster (via `spec.remote.cluster`)

### Filesystem CR Structure (Scale)

```typescript
{
  apiVersion: 'scale.spectrum.ibm.com/v1beta1',
  kind: 'Filesystem',   // NOTE: lowercase 's' in 'Filesystem'
  metadata: {
    name: `${remoteClusterName}-${remoteFileSystemName}`,  // e.g., "my-scale-system-fs1"
    namespace: 'ibm-spectrum-scale',
  },
  spec: {
    remote: {
      cluster: remoteClusterName,  // References RemoteCluster CR
      fs: remoteFileSystemName,     // Name of filesystem on remote cluster
    },
    seLinuxOptions: {
      level: 's0',
      role: 'object_r',
      type: 'container_file_t',
      user: 'system_u',
    },
  },
}
```

### Example

- RemoteCluster: "my-scale-system"
- Filesystem 1: "my-scale-system-fs1" → references remote filesystem "fs1"
- Filesystem 2: "my-scale-system-fs2" → references remote filesystem "fs2"
- Filesystem 3: "my-scale-system-fs3" → references remote filesystem "fs3"

**Result**: One RemoteCluster can have multiple Filesystem CRs (one per remote filesystem)

### Dashboard Display

- Scale dashboard shows Filesystem CRs with `spec.remote`
- **Filtered by RemoteCluster name**: Uses `filterScaleFileSystems()` which filters by `spec.remote.cluster === externalSystemName` (from URL params)
- Shows only filesystems belonging to the current RemoteCluster being viewed
- Table columns: Name, Connection status (Connected/Disconnected)
- Connection status determined by `status.conditions` with type `'Success'` and status `'True'`

**Code**: `packages/odf/components/scale-dashboard/FileSystems.tsx`
**Filter**: `packages/odf/components/ibm-common/utils.ts` → `filterScaleFileSystems()`

---

## SAN Filesystem CRs

### Initial Setup

- **One Filesystem CR** is **optionally** created when setting up SAN (LUN group creation is optional during initial setup)
- Created from selected LUNs (LocalDisk CRs)
- Name: User-provided LUN group name

### Adding More Filesystems

- **"Add LUN group"** modal allows adding more Filesystem CRs
- Each Filesystem CR represents a different LUN group
- Each LUN group uses different LUNs (LocalDisk CRs)
- Used LUNs are filtered out so they can't be assigned to multiple groups

### Filesystem CR Structure (SAN)

```typescript
{
  apiVersion: 'scale.spectrum.ibm.com/v1beta1',
  kind: 'Filesystem',   // NOTE: lowercase 's' in 'Filesystem'
  metadata: {
    name: lunGroupName,  // User-provided name (e.g., "lun-group-a")
    namespace: 'ibm-spectrum-scale',
  },
  spec: {
    local: {
      blockSize: '4M',        // At the 'local' level, NOT inside pools
      replication: '1-way',
      type: 'shared',
      pools: [{
        disks: [/* LocalDisk CR names (e.g., "localdisk-600508b...") */],
        name: 'system',       // Default pool name
      }],
    },
  },
}
```

**Important structural note**: `blockSize` is a field of `spec.local`, NOT inside `spec.local.pools[]`. The pools only contain `disks` and `name`.

### Example

- LUN Group 1: "lun-group-a" → uses LUNs with WWNs 600508b..., 600508c..., 600508d...
- LUN Group 2: "lun-group-b" → uses LUNs with WWNs 700508a..., 700508b..., 700508c...
- LUN Group 3: "lun-group-c" → uses LUNs with WWNs 800508a..., 800508b..., 800508c...

**Result**: Multiple Filesystem CRs (one per LUN group)

### StorageClasses Created

Each SAN Filesystem CR gets **two** StorageClasses:

```
Filesystem "lun-group-a"
  ├─> StorageClass "san-lun-group-a"      (for containers, filesetType: 'independent')
  └─> StorageClass "san-lun-group-a-vm"   (for VMs, volumeType: 'vmdisk')
```

### Dashboard Display

- SAN dashboard shows **ALL** Filesystem CRs with `spec.local` (and no `spec.remote`)
- Uses `filterSANFileSystems()` which checks `fs.spec.local && _.isEmpty(fs.spec.remote)`
- Table columns: Name, Status, StorageClasses, Console link, Kebab actions
- LUN group statuses: Connected (OK), Creating (LOADING), Unhealthy (ERROR)
- Each LUN group links to a detail view at: `/odf/external-systems/scale.spectrum.ibm.com~v1beta1~cluster/SAN_Storage/filesystems/ns/{namespace}/{name}`
- Console link points to Scale GUI at: `https://{route-host}/gui#files-filesystems-/{fsName}`
- Kebab actions: Delete LUN group

**Code**: `packages/odf/components/san-dashboard/LUNCard.tsx`
**Filter**: `packages/odf/components/ibm-common/utils.ts` → `filterSANFileSystems()`
**Health**: `packages/odf/components/ibm-common/lun-group-health.ts`

---

## Key Differences

| Aspect                 | Scale (CNSA)                                   | SAN                                        |
| ---------------------- | ---------------------------------------------- | ------------------------------------------ |
| **Filesystem Type**    | `spec.remote`                                  | `spec.local`                               |
| **Kind**               | `Filesystem` (lowercase 's')                   | `Filesystem` (lowercase 's')               |
| **References**         | RemoteCluster CR + remote filesystem name      | LocalDisk CRs (LUNs)                       |
| **Naming Pattern**     | `${remoteClusterName}-${remoteFileSystemName}` | User-provided LUN group name               |
| **Can Have Multiple?** | **YES** - Multiple remote filesystems          | **YES** - Multiple LUN groups              |
| **How to Add More**    | "Add remote FileSystem" modal                  | "Add LUN group" modal                      |
| **StorageClasses**     | Not created during setup                       | **Two** per Filesystem (container + VM)    |
| **seLinuxOptions**     | Set (level, role, type, user)                  | Not set                                    |
| **blockSize**          | N/A (remote)                                   | `'4M'` at `spec.local` level               |
| **Replication**        | N/A (managed by remote)                        | `'1-way'` (configurable: 1/2/3-way)        |
| **Dashboard Filter**   | By RemoteCluster name                          | All local filesystems (no further filter)  |
| **Dashboard Columns**  | Name, Connection status                        | Name, Status, StorageClasses, Console link |
| **Delete Support**     | Not available in UI                            | Delete LUN group modal                     |

---

## Relationship Summary

### Scale System

```
RemoteCluster CR ("my-scale-system")
  ├─> Filesystem CR ("my-scale-system-fs1") → spec.remote.cluster = "my-scale-system", spec.remote.fs = "fs1"
  ├─> Filesystem CR ("my-scale-system-fs2") → spec.remote.cluster = "my-scale-system", spec.remote.fs = "fs2"
  └─> Filesystem CR ("my-scale-system-fs3") → spec.remote.cluster = "my-scale-system", spec.remote.fs = "fs3"
```

**One RemoteCluster** → **Multiple Filesystem CRs** (one per remote filesystem)

### SAN System

```
Cluster CR ("ibm-spectrum-scale")  [namespaced, shared with Scale]
  ├─> Filesystem CR ("lun-group-a") → spec.local (uses LocalDisk CRs)
  │     ├─> StorageClass "san-lun-group-a"       (containers)
  │     └─> StorageClass "san-lun-group-a-vm"    (VMs)
  ├─> Filesystem CR ("lun-group-b") → spec.local (uses LocalDisk CRs)
  │     ├─> StorageClass "san-lun-group-b"       (containers)
  │     └─> StorageClass "san-lun-group-b-vm"    (VMs)
  └─> Filesystem CR ("lun-group-c") → spec.local (uses LocalDisk CRs)
        ├─> StorageClass "san-lun-group-c"       (containers)
        └─> StorageClass "san-lun-group-c-vm"    (VMs)
```

**One Cluster CR** → **Multiple Filesystem CRs** (one per LUN group) → **Two StorageClasses each**

---

## Filter Functions

Three filter functions in `packages/odf/components/ibm-common/utils.ts`:

| Function                                                 | Filter Logic                                                          | Used By                        |
| -------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------ |
| `filterScaleFileSystems(fileSystems, remoteClusterName)` | `spec.remote` present AND `spec.remote.cluster === remoteClusterName` | Scale dashboard                |
| `filterSANFileSystems(fileSystems)`                      | `spec.local` present AND `spec.remote` empty                          | SAN dashboard                  |
| `filterCnsaFileSystems(fileSystems)`                     | `spec.remote` present (any remote filesystem)                         | External Systems overview card |

---

## Code Locations

### Scale

- **Create Filesystem**: `packages/odf/components/create-storage-system/external-systems/CreateScaleSystem/payload.ts` → `createFileSystem()` (line 122-147)
- **Add Remote FileSystem Modal**: `packages/odf/modals/add-remote-fs/AddRemoteFileSystemModal.tsx`
- **Display Filesystems**: `packages/odf/components/scale-dashboard/FileSystems.tsx`
- **Filter Function**: `packages/odf/components/ibm-common/utils.ts` → `filterScaleFileSystems()`
- **Health Status**: `packages/odf/components/ibm-common/cnsa-filesystem-health.ts`

### SAN

- **Create Filesystem**: `packages/odf/components/create-storage-system/external-systems/CreateSANSystem/payload.ts` → `createLocalFileSystem()` (line 72-117)
- **Create StorageClasses**: `packages/odf/components/create-storage-system/external-systems/CreateSANSystem/payload.ts` → `createStorageClass()` (line 119-184)
- **Add LUN Group Modal**: `packages/odf/modals/lun-group/AddLunGroupModal.tsx`
- **Delete LUN Group Modal**: `packages/odf/modals/lun-group/DeleteLUNModal.tsx`
- **Display LUN Groups**: `packages/odf/components/san-dashboard/LUNCard.tsx`
- **Filter Function**: `packages/odf/components/ibm-common/utils.ts` → `filterSANFileSystems()`
- **Health Status**: `packages/odf/components/ibm-common/lun-group-health.ts`
- **Scale GUI Link**: `packages/odf/components/san-dashboard/useScaleGUILink.ts`

### Shared

- **Name Validation**: `packages/odf/components/create-storage-system/external-systems/common/useResourceNameValidation.ts` → `useExistingFileSystemNames()`

---

## Important Notes

1. **Both support multiple Filesystem CRs** - Neither is limited to one
2. **Kind is `Filesystem`** - Note the lowercase 's' (not `FileSystem`)
3. **Scale Filesystem CRs are tied to RemoteCluster** via `spec.remote.cluster`
4. **SAN Filesystem CRs are independent** - each is a separate LUN group
5. **SAN creates TWO StorageClasses per Filesystem** - one for containers (`san-{name}`), one for VMs (`san-{name}-vm`)
6. **Scale does NOT create StorageClasses** during filesystem setup
7. **Scale dashboard filters Filesystems by RemoteCluster name** - only shows filesystems belonging to the current RemoteCluster
8. **SAN dashboard shows ALL local Filesystems** - filtered only by `spec.local` present
9. **Scale Filesystem CRs include seLinuxOptions** - for container security context
10. **SAN `blockSize` is at `spec.local` level** - not inside pools (each pool only has `disks` and `name`)
11. **Used LUNs are filtered out** - LUNs already assigned to a LocalDisk CR won't appear in the selection table when adding new LUN groups
12. **Name validation** - Both modals validate against existing Filesystem names using `useExistingFileSystemNames()` to prevent duplicates
