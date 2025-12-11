# FileSystem CRs in Scale vs SAN

## Answer: Both Can Have Multiple FileSystem CRs

**Scale**: Can have **multiple** FileSystem CRs (one per remote filesystem)
**SAN**: Can have **multiple** FileSystem CRs (one per LUN group)

## Scale FileSystem CRs

### Initial Setup

- **One FileSystem CR** is created during Scale system setup
- References a remote filesystem on the external Scale cluster
- Name pattern: `${remoteClusterName}-${remoteFileSystemName}`

### Adding More FileSystems

- **"Add Remote FileSystem"** modal allows adding more FileSystem CRs
- Each FileSystem CR references a different remote filesystem
- All FileSystem CRs reference the same RemoteCluster (via `spec.remote.cluster`)

### FileSystem CR Structure (Scale)

```typescript
{
  metadata: {
    name: `${remoteClusterName}-${remoteFileSystemName}`,  // e.g., "my-scale-system-fs1"
  },
  spec: {
    remote: {
      cluster: remoteClusterName,  // References RemoteCluster CR
      fs: remoteFileSystemName,     // Name of filesystem on remote cluster
    },
  },
}
```

### Example

- RemoteCluster: "my-scale-system"
- FileSystem 1: "my-scale-system-fs1" → references remote filesystem "fs1"
- FileSystem 2: "my-scale-system-fs2" → references remote filesystem "fs2"
- FileSystem 3: "my-scale-system-fs3" → references remote filesystem "fs3"

**Result**: One RemoteCluster can have multiple FileSystem CRs (one per remote filesystem)

### Dashboard Display

- Scale dashboard shows **ALL** FileSystem CRs with `spec.remote`
- Currently **not filtered** by RemoteCluster name
- Shows all remote filesystems across all RemoteClusters

**Code**: `packages/odf/components/scale-dashboard/FileSystems.tsx`

---

## SAN FileSystem CRs

### Initial Setup

- **One FileSystem CR** is created when creating the first LUN group
- Created from selected LUNs (LocalDisk CRs)
- Name: User-provided LUN group name

### Adding More FileSystems

- **"Add LUN group"** modal allows adding more FileSystem CRs
- Each FileSystem CR represents a different LUN group
- Each LUN group uses different LUNs (LocalDisk CRs)

### FileSystem CR Structure (SAN)

```typescript
{
  metadata: {
    name: lunGroupName,  // User-provided name (e.g., "LUN_groupA")
  },
  spec: {
    local: {
      replication: '1-way',
      type: 'shared',
      pools: [{
        blockSize: '4M',
        disks: [/* LocalDisk CR names */],
        name: 'system',
      }],
    },
  },
}
```

### Example

- LUN Group 1: "LUN_groupA" → uses LUNs 1, 2, 3
- LUN Group 2: "LUN_groupB" → uses LUNs 4, 5, 6
- LUN Group 3: "LUN_groupC" → uses LUNs 7, 8, 9

**Result**: Multiple FileSystem CRs (one per LUN group)

### Dashboard Display

- SAN dashboard shows **ALL** FileSystem CRs with `spec.local`
- Filtered to show only local filesystems (not remote)

**Code**: `packages/odf/components/san-dashboard/LUNCard.tsx`

---

## Key Differences

| Aspect                 | Scale                                          | SAN                           |
| ---------------------- | ---------------------------------------------- | ----------------------------- |
| **FileSystem Type**    | `spec.remote`                                  | `spec.local`                  |
| **References**         | RemoteCluster CR + remote filesystem name      | LocalDisk CRs (LUNs)          |
| **Naming Pattern**     | `${remoteClusterName}-${remoteFileSystemName}` | User-provided LUN group name  |
| **Can Have Multiple?** | **YES** - Multiple remote filesystems          | **YES** - Multiple LUN groups |
| **How to Add More**    | "Add Remote FileSystem" modal                  | "Add LUN group" modal         |
| **StorageClass**       | One per FileSystem CR                          | One per FileSystem CR         |

---

## Relationship Summary

### Scale System

```
RemoteCluster CR ("my-scale-system")
  ├─> FileSystem CR ("my-scale-system-fs1") → spec.remote.cluster = "my-scale-system"
  ├─> FileSystem CR ("my-scale-system-fs2") → spec.remote.cluster = "my-scale-system"
  └─> FileSystem CR ("my-scale-system-fs3") → spec.remote.cluster = "my-scale-system"
```

**One RemoteCluster** → **Multiple FileSystem CRs** (one per remote filesystem)

### SAN System

```
Cluster CR ("ibm-spectrum-scale")
  ├─> FileSystem CR ("LUN_groupA") → spec.local (uses LocalDisk CRs)
  ├─> FileSystem CR ("LUN_groupB") → spec.local (uses LocalDisk CRs)
  └─> FileSystem CR ("LUN_groupC") → spec.local (uses LocalDisk CRs)
```

**One Cluster CR** → **Multiple FileSystem CRs** (one per LUN group)

---

## Code Locations

### Scale

- **Create FileSystem**: `packages/odf/components/create-storage-system/external-systems/CreateScaleSystem/payload.ts` (line 121-146)
- **Add Remote FileSystem Modal**: `packages/odf/modals/add-remote-fs/AddRemoteFileSystemModal.tsx`
- **Display FileSystems**: `packages/odf/components/scale-dashboard/FileSystems.tsx`

### SAN

- **Create FileSystem**: `packages/odf/components/create-storage-system/external-systems/CreateSANSystem/payload.ts` (line 72-117)
- **Add LUN Group Modal**: `packages/odf/modals/lun-group/AddLunGroupModal.tsx`
- **Display LUN Groups**: `packages/odf/components/san-dashboard/LUNCard.tsx`

---

## Important Notes

1. **Both support multiple FileSystem CRs** - Neither is limited to one
2. **Scale FileSystem CRs are tied to RemoteCluster** via `spec.remote.cluster`
3. **SAN FileSystem CRs are independent** - each is a separate LUN group
4. **Each FileSystem CR gets its own StorageClass** - regardless of Scale or SAN
5. **Scale dashboard shows ALL remote FileSystems** - not filtered by RemoteCluster (potential improvement area)
