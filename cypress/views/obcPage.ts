import { projectNameSpace } from '../support/pages/app';
import { DEPLOYMENT_REPLICAS_STATUS, MINUTE } from '../utils/consts';

export class CreateOBCHandler {
  name: string;

  namespace: string;

  storageclass: string;

  constructor(name: string, namespace: string, storageclass: string) {
    this.name = name;
    this.namespace = namespace;
    this.storageclass = storageclass;
  }

  createBucketClaim() {
    cy.clickNavLink(['Storage', 'Object Bucket Claims']);
    projectNameSpace.selectOrCreateProject(this.namespace);
    cy.clickNavLink(['Storage', 'Object Bucket Claims']);
    cy.byLegacyTestID('namespace-bar-dropdown').contains('Project').click();
    cy.contains(this.namespace);
    cy.byTestID('item-create').click();
    cy.byTestID('obc-name').type(this.name);
    cy.byTestID('loading-indicator').should('not.exist');
    cy.byTestID('sc-dropdown').should('be.visible').click();
    cy.contains('openshift-storage.noobaa.io').click();
    cy.get('button').contains('Create').click();
    cy.byLegacyTestID('resource-title').contains(this.name, {
      timeout: MINUTE,
    });
  }

  revealHiddenValues() {
    cy.contains('Reveal Values').click();
  }

  hideValues() {
    cy.contains('Hide Values').click();
  }

  deleteBucketClaim() {
    cy.byTestID('loading-indicator').should('not.exist');
    cy.log('Deleting Object Bucket Claim');
    cy.byTestID('kebab-button').click();
    cy.byTestActionID('Delete Object Bucket Claim').click();
    cy.byTestID('delete-action').click();
  }
}
