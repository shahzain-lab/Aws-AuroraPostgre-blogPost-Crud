import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as appsync from '@aws-cdk/aws-appsync-alpha';

export class ServerlessAuroraMysqlStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    
    
    const api = new appsync.GraphqlApi(this, 'restaurantGraphAPi', {
      name: 'restaurant-graph',
      schema: appsync.Schema.fromAsset('graphql/schema.gql'),
         authorizationConfig: {
          defaultAuthorization: {
            authorizationType: appsync.AuthorizationType.API_KEY,
            apiKeyConfig: {
              expires: cdk.Expiration.after(cdk.Duration.days(365))
            }
          },
        },
    })

    const vpc = new ec2.Vpc(this, 'auroraPostgre');

    const cluster = new rds.ServerlessCluster(this, 'serverlessCluster', {
      vpc,
      engine: rds.DatabaseClusterEngine.AURORA_POSTGRESQL,
      parameterGroup: rds.ParameterGroup.fromParameterGroupName(this, 'ParameterGroup', 'default.aurora-postgresql10'),
      defaultDatabaseName: "postreDBs",
      scaling: {
        autoPause: cdk.Duration.seconds(0)
      }
    })

    // Create the Lambda function that will map GraphQL operations into Postgres
    const postFn = new lambda.Function(this, 'MyFunction', {
      runtime: lambda.Runtime.NODEJS_14_X,
      code: new lambda.AssetCode('lambda'),
      handler: 'index.handler',
      memorySize: 1024,
      environment: {
        CLUSTER_ARN: cluster.clusterArn,
        SECRET_ARN: cluster.secret?.secretArn || '',
        DB_NAME: 'postreDBs',
        AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1'
      },
    });

 // Grant access to the cluster from the Lambda function
 cluster.grantDataApiAccess(postFn);
 // Set the new Lambda function as a data source for the AppSync API
 const lambdaDs = api.addLambdaDataSource('lambdaDatasource', postFn);

 // Map the resolvers to the Lambda function
 lambdaDs.createResolver({
   typeName: 'Query',
   fieldName: 'listPosts'
 });
 lambdaDs.createResolver({
   typeName: 'Query',
   fieldName: 'getPostById'
 });
 lambdaDs.createResolver({
   typeName: 'Mutation',
   fieldName: 'createPost'
 });
 lambdaDs.createResolver({
   typeName: 'Mutation',
   fieldName: 'updatePost'
 });
 lambdaDs.createResolver({
   typeName: 'Mutation',
   fieldName: 'deletePost'
 });

 // CFN Outputs
 new cdk.CfnOutput(this, 'AppSyncAPIURL', {
   value: api.graphqlUrl
 });
  }
}
